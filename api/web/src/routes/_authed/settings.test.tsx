import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "@/routeTree.gen";
import * as api from "@/lib/api";
import { type AuthState, getAuth, setAuth } from "@/lib/auth";
import { API_DOCS_URL } from "@/lib/shell";

// The shell + settings flow is exercised end-to-end through the real router;
// only the network boundary (`api.revoke`) is spied. Local auth uses the real
// `localStorage`-backed store so logout's clearing is observable via `getAuth`.

const SESSION: AuthState = {
  token: "tok-1",
  refresh: "ref-1",
  expiry: "2099-01-01T00:00:00Z", // far future → never "expired"
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
  setAuth(SESSION);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("app shell", () => {
  it("renders the logged-in username and a human-readable token-expiry", async () => {
    renderAppAt("/settings");

    expect(await screen.findByTestId("shell-username")).toHaveTextContent(
      "alice",
    );
    const expiry = screen.getByTestId("shell-expiry");
    expect(expiry).toHaveTextContent("Expires");
    expect(expiry).toHaveTextContent("2099");
  });

  it("renders the data-sovereignty badge with ownership-framed copy", async () => {
    renderAppAt("/settings");

    const badges = await screen.findAllByTestId("sovereignty-badge");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toHaveTextContent(/your data, on your server/i);
    // No zero-knowledge wording anywhere in the rendered shell.
    expect(document.body.textContent?.toLowerCase()).not.toContain(
      "zero-knowledge",
    );
    expect(document.body.textContent?.toLowerCase()).not.toContain(
      "can't read",
    );
  });

  it("links to the documented API docs URL", async () => {
    renderAppAt("/settings");

    const link = await screen.findByTestId("api-docs-link");
    expect(link).toHaveAttribute("href", API_DOCS_URL);
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("settings logout", () => {
  it("revokes the session, clears local auth, and routes to /login", async () => {
    const user = userEvent.setup();
    const revokeSpy = vi.spyOn(api, "revoke").mockResolvedValue(undefined);

    const router = renderAppAt("/settings");

    await user.click(await screen.findByTestId("logout-button"));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/login"),
    );
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(getAuth()).toBeNull();
  });

  it("still clears local auth and routes to /login when revoke fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "revoke").mockRejectedValue(new api.ApiError(500, "boom"));

    const router = renderAppAt("/settings");

    await user.click(await screen.findByTestId("logout-button"));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/login"),
    );
    expect(getAuth()).toBeNull();
  });

  it("blocks re-entry to a guarded route after logout (redirects to /login)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "revoke").mockResolvedValue(undefined);

    const router = renderAppAt("/settings");

    await user.click(await screen.findByTestId("logout-button"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/login"),
    );

    // Revisiting a protected route with cleared auth bounces back to /login.
    await router.navigate({ to: "/" });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/login"),
    );
    expect(router.state.location.search).toMatchObject({ redirect: "/" });
  });
});
