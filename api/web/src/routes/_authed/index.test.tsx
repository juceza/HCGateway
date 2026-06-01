import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "@/routeTree.gen";
import * as api from "@/lib/api";
import { type AuthState, setAuth } from "@/lib/auth";

// The dashboard is exercised end-to-end through the real router + query layer;
// only the API boundary (`getCounts`/`fetchRecords`) is spied. This proves the
// counts→cards→sparkline flow and that exactly the 8 charted types fetch.

const SESSION: AuthState = {
  token: "tok-1",
  refresh: "ref-1",
  expiry: "2026-06-01T12:00:00Z",
  username: "alice",
};

/** The 8 charted high-value types (mirrors the registry). */
const CHARTED = [
  "ActiveCaloriesBurned",
  "BodyFat",
  "HeartRate",
  "RestingHeartRate",
  "SleepSession",
  "Steps",
  "TotalCaloriesBurned",
  "Weight",
];

function recentRecord(data: Record<string, unknown>): api.HealthRecord {
  return {
    _id: "r1",
    id: "r1",
    data,
    start: new Date(Date.now() - 86_400_000).toISOString(),
    end: null,
    app: "com.example",
  };
}

/** Default per-type records so every charted card has a value + sparkline. */
function defaultRecordsFor(displayName: string): api.HealthRecord[] {
  switch (displayName) {
    case "Steps":
      return [recentRecord({ count: 1234 })];
    case "HeartRate":
      return [
        recentRecord({
          samples: [
            { time: new Date(Date.now() - 86_400_000).toISOString(), beatsPerMinute: 62 },
          ],
        }),
      ];
    case "Weight":
      return [recentRecord({ weight: 70.5 })];
    case "BodyFat":
      return [recentRecord({ percentage: 22.5 })];
    case "RestingHeartRate":
      return [recentRecord({ beatsPerMinute: 58 })];
    case "ActiveCaloriesBurned":
    case "TotalCaloriesBurned":
      return [recentRecord({ energy: 540 })];
    case "SleepSession":
      return [
        {
          _id: "s1",
          id: "s1",
          data: {},
          start: new Date(Date.now() - 86_400_000).toISOString(),
          end: new Date(Date.now() - 86_400_000 + 8 * 3_600_000).toISOString(),
          app: "com.example",
        },
      ];
    default:
      return [];
  }
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

describe("dashboard home", () => {
  it("renders only count>0 types, grouped by category", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({
      Steps: 1234, // Activity, charted
      Distance: 5, // Activity, not charted
      HeartRate: 42, // Vitals, charted
      Weight: 3, // Body, charted
      BodyFat: 0, // dropped (zero)
    });
    vi.spyOn(api, "fetchRecords").mockImplementation(async (name) =>
      defaultRecordsFor(name),
    );

    renderDashboard();

    expect(await screen.findByTestId("category-Activity")).toBeInTheDocument();
    expect(screen.getByTestId("category-Vitals")).toBeInTheDocument();
    expect(screen.getByTestId("category-Body")).toBeInTheDocument();
    // Zero-count BodyFat never renders.
    expect(screen.queryByTestId("card-BodyFat")).not.toBeInTheDocument();
    // Populated types render.
    expect(screen.getByTestId("card-Steps")).toBeInTheDocument();
    expect(screen.getByTestId("card-Distance")).toBeInTheDocument();
    expect(screen.getByTestId("card-HeartRate")).toBeInTheDocument();
  });

  it("renders a recent value + sparkline for a charted type", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({ Steps: 1234 });
    vi.spyOn(api, "fetchRecords").mockResolvedValue([
      recentRecord({ count: 1234 }),
    ]);

    renderDashboard();

    const card = await screen.findByTestId("card-Steps");
    await waitFor(() =>
      expect(within(card).getByTestId("card-value")).toHaveTextContent(
        "1,234 steps",
      ),
    );
    expect(within(card).getByTestId("sparkline")).toBeInTheDocument();
  });

  it("renders label + count for a non-charted type and issues no fetch for it", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({ Distance: 5 });
    const fetchSpy = vi
      .spyOn(api, "fetchRecords")
      .mockResolvedValue([]);

    renderDashboard();

    const card = await screen.findByTestId("card-Distance");
    expect(within(card).getByTestId("card-count")).toHaveTextContent("5");
    expect(within(card).getByText("Distance")).toBeInTheDocument();
    // No charted types present → no /fetch at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a per-card skeleton while the sparkline query is loading", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({ Steps: 1234 });
    // A never-resolving fetch keeps the card in its loading state.
    vi.spyOn(api, "fetchRecords").mockReturnValue(new Promise(() => {}));

    renderDashboard();

    const card = await screen.findByTestId("card-Steps");
    expect(within(card).getByTestId("card-skeleton")).toBeInTheDocument();
  });

  it("shows a per-card empty state when the window has no records", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({ Steps: 1234 });
    vi.spyOn(api, "fetchRecords").mockResolvedValue([]);

    renderDashboard();

    const card = await screen.findByTestId("card-Steps");
    await waitFor(() =>
      expect(within(card).getByTestId("card-empty")).toBeInTheDocument(),
    );
  });

  it("shows a per-card error state when the sparkline query fails", async () => {
    vi.spyOn(api, "getCounts").mockResolvedValue({ Steps: 1234 });
    vi.spyOn(api, "fetchRecords").mockRejectedValue(new api.ApiError(500, "x"));

    renderDashboard();

    const card = await screen.findByTestId("card-Steps");
    await waitFor(() =>
      expect(within(card).getByTestId("card-error")).toBeInTheDocument(),
    );
  });

  it("issues a /fetch for exactly the 8 charted types and none of the others", async () => {
    // Every charted type plus several non-charted types are populated.
    const counts: Record<string, number> = {
      Distance: 5,
      Hydration: 9,
      BloodGlucose: 3,
    };
    for (const name of CHARTED) counts[name] = 10;

    vi.spyOn(api, "getCounts").mockResolvedValue(counts);
    const fetchSpy = vi
      .spyOn(api, "fetchRecords")
      .mockImplementation(async (name) => defaultRecordsFor(name));

    renderDashboard();

    await screen.findByTestId("card-Steps");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(CHARTED.length));

    const fetched = fetchSpy.mock.calls.map((c) => c[0]).sort();
    expect(fetched).toEqual([...CHARTED].sort());
  });

  it("navigates to /records/<Type> when a card is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getCounts").mockResolvedValue({ Steps: 1234 });
    vi.spyOn(api, "fetchRecords").mockResolvedValue([
      recentRecord({ count: 1234 }),
    ]);

    const router = renderDashboard();

    await user.click(await screen.findByTestId("card-Steps"));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/records/Steps"),
    );
    expect(await screen.findByTestId("record-detail")).toHaveTextContent(
      "Steps",
    );
  });

  it("renders the counts skeleton first, then fills sparklines incrementally", async () => {
    let resolveCounts: (counts: Record<string, number>) => void = () => {};
    const countsReady = new Promise<Record<string, number>>((resolve) => {
      resolveCounts = resolve;
    });
    let resolveRecords: (records: api.HealthRecord[]) => void = () => {};
    const recordsReady = new Promise<api.HealthRecord[]>((resolve) => {
      resolveRecords = resolve;
    });

    // Both queries are held open so we can observe each transition deterministically.
    vi.spyOn(api, "getCounts").mockReturnValue(countsReady);
    vi.spyOn(api, "fetchRecords").mockReturnValue(recordsReady);

    renderDashboard();

    // Counts-first: while /counts is in flight the dashboard skeleton shows.
    expect(await screen.findByTestId("dashboard-skeleton")).toBeInTheDocument();

    // Once counts resolve, the card mounts with its own loading skeleton.
    resolveCounts({ Steps: 1234 });
    const card = await screen.findByTestId("card-Steps");
    expect(within(card).getByTestId("card-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();

    // Resolving the per-type fetch fills the sparkline incrementally.
    resolveRecords([recentRecord({ count: 1234 })]);
    await waitFor(() =>
      expect(within(card).getByTestId("sparkline")).toBeInTheDocument(),
    );
    expect(within(card).getByTestId("card-value")).toHaveTextContent(
      "1,234 steps",
    );
  });
});
