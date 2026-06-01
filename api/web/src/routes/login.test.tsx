import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "@/routeTree.gen";
import { type AuthState, setAuth } from "@/lib/auth";

// Mock only the network helper `login`; keep the real error classes for
// `instanceof` checks in the component's error mapping.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, login: vi.fn() };
});
import { ApiError, login } from "@/lib/api";

const SESSION: AuthState = {
  token: "tok-1",
  refresh: "ref-1",
  expiry: "2026-06-01T12:00:00Z",
  username: "alice",
};

function renderAppAt(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(login).mockReset();
});

describe("login route", () => {
  it("renders the unknown-username warning before submit", async () => {
    renderAppAt("/login");
    expect(await screen.findByTestId("unknown-username-notice")).toBeInTheDocument();
  });

  it("shows the HTTP security notice under an http origin (jsdom default)", async () => {
    renderAppAt("/login");
    expect(await screen.findByTestId("http-notice")).toBeInTheDocument();
  });

  it("submits valid credentials with no fcmToken and lands on the dashboard", async () => {
    const user = userEvent.setup();
    // A successful login persists the session so the guard lets `/` load.
    vi.mocked(login).mockImplementation(async () => {
      setAuth(SESSION);
      return SESSION;
    });

    renderAppAt("/login");
    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    // Exactly (username, password) — never an fcmToken third argument.
    expect(vi.mocked(login).mock.calls[0]).toEqual(["alice", "s3cret"]);
    expect(
      await screen.findByRole("heading", { name: "Your health" }),
    ).toBeInTheDocument();
  });

  it("honors ?redirect= and returns to the originally-requested path", async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockImplementation(async () => {
      setAuth(SESSION);
      return SESSION;
    });

    const router = renderAppAt("/login?redirect=%2F");
    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("shows a credentials error on a 401 without leaving the form", async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockRejectedValue(new ApiError(401, "bad creds"));

    const router = renderAppAt("/login");
    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Incorrect username or password.",
    );
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows a connection error when the request fails (network)", async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockRejectedValue(new TypeError("Failed to fetch"));

    renderAppAt("/login");
    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Could not reach the server",
    );
  });
});
