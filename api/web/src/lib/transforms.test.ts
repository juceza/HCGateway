import { describe, expect, it } from "vitest";
import {
  type Sample,
  bucketSeries,
  buildTimeWindowQuery,
  deriveGranularity,
} from "./transforms";

// Mirror of the server allowlist (`api/apiVersions/v2/routes.py` —
// `_sanitize_query`). The integration test below asserts the builder's output
// against these exact rules so a drift on either side fails the suite.
const ALLOWED_QUERY_FIELDS = new Set(["_id", "id", "app", "start", "end"]);
const ALLOWED_QUERY_OPS = new Set([
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
]);

/** Re-implementation of the server's `_sanitize_query` acceptance check. */
function passesAllowlist(q: Record<string, unknown>): boolean {
  for (const [field, value] of Object.entries(q)) {
    if (field.startsWith("$") || !ALLOWED_QUERY_FIELDS.has(field)) return false;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const op of Object.keys(value as Record<string, unknown>)) {
        if (!ALLOWED_QUERY_OPS.has(op)) return false;
      }
    }
  }
  return true;
}

describe("buildTimeWindowQuery", () => {
  it("yields start $gte/$lte ISO bounds for a 7-day window", () => {
    const start = new Date("2026-05-01T00:00:00Z");
    const end = new Date("2026-05-08T00:00:00Z");
    const q = buildTimeWindowQuery({ start, end });

    expect(q).toEqual({
      start: {
        $gte: "2026-05-01T00:00:00.000Z",
        $lte: "2026-05-08T00:00:00.000Z",
      },
    });
  });

  it("normalises string bounds to canonical ISO-8601 UTC (...Z)", () => {
    const q = buildTimeWindowQuery({
      start: "2026-05-01T12:00:00Z",
      end: "2026-05-02T12:00:00Z",
    });
    expect(q.start?.$gte).toBe("2026-05-01T12:00:00.000Z");
    expect(q.start?.$lte).toBe("2026-05-02T12:00:00.000Z");
    // Lexicographic order must match chronological order.
    expect(q.start!.$gte! < q.start!.$lte!).toBe(true);
  });

  it("never emits a disallowed field or operator", () => {
    const q = buildTimeWindowQuery({
      start: "2026-05-01T00:00:00Z",
      end: "2026-05-08T00:00:00Z",
    });
    expect(Object.keys(q)).toEqual(["start"]);
    for (const field of Object.keys(q)) {
      expect(ALLOWED_QUERY_FIELDS.has(field)).toBe(true);
    }
    for (const op of Object.keys(q.start!)) {
      expect(ALLOWED_QUERY_OPS.has(op)).toBe(true);
    }
    // Explicitly: no $where or other injection-style operator leaks in.
    expect(JSON.stringify(q)).not.toContain("$where");
  });
});

describe("deriveGranularity", () => {
  it("is hourly for a 1-day window", () => {
    expect(
      deriveGranularity({
        start: "2026-05-01T00:00:00Z",
        end: "2026-05-02T00:00:00Z",
      }),
    ).toBe("hour");
  });

  it("is daily for a 7-day (week) window", () => {
    expect(
      deriveGranularity({
        start: "2026-05-01T00:00:00Z",
        end: "2026-05-08T00:00:00Z",
      }),
    ).toBe("day");
  });

  it("is daily for a 30-day (month) window", () => {
    expect(
      deriveGranularity({
        start: "2026-05-01T00:00:00Z",
        end: "2026-05-31T00:00:00Z",
      }),
    ).toBe("day");
  });

  it("is weekly for a window wider than ~3 months", () => {
    expect(
      deriveGranularity({
        start: "2026-01-01T00:00:00Z",
        end: "2026-06-01T00:00:00Z",
      }),
    ).toBe("week");
  });
});

describe("bucketSeries", () => {
  it("returns [] for an empty series", () => {
    expect(bucketSeries([], "day")).toEqual([]);
  });

  it("returns one bucket for a single-point series", () => {
    const samples: Sample[] = [{ start: "2026-05-01T03:30:00Z", value: 42 }];
    const out = bucketSeries(samples, "day");
    expect(out).toEqual([{ t: "2026-05-01T00:00:00.000Z", avg: 42 }]);
  });

  it("averages values within each bucket", () => {
    const samples: Sample[] = [
      { start: "2026-05-01T01:00:00Z", value: 10 },
      { start: "2026-05-01T05:00:00Z", value: 20 },
      { start: "2026-05-02T02:00:00Z", value: 100 },
    ];
    const out = bucketSeries(samples, "day");
    expect(out).toEqual([
      { t: "2026-05-01T00:00:00.000Z", avg: 15 },
      { t: "2026-05-02T00:00:00.000Z", avg: 100 },
    ]);
  });

  it("buckets hourly and orders buckets ascending by t", () => {
    // Provided out of order — output must be sorted ascending.
    const samples: Sample[] = [
      { start: "2026-05-01T02:45:00Z", value: 30 },
      { start: "2026-05-01T01:10:00Z", value: 10 },
      { start: "2026-05-01T01:50:00Z", value: 20 },
    ];
    const out = bucketSeries(samples, "hour");
    expect(out.map((p) => p.t)).toEqual([
      "2026-05-01T01:00:00.000Z",
      "2026-05-01T02:00:00.000Z",
    ]);
    expect(out[0].avg).toBe(15); // mean of 10 and 20
    expect(out[1].avg).toBe(30);
  });

  it("emits per-bucket min/max for amplitude types (HeartRate-like)", () => {
    const samples: Sample[] = [
      { start: "2026-05-01T00:05:00Z", value: 60 },
      { start: "2026-05-01T00:30:00Z", value: 120 },
      { start: "2026-05-01T00:50:00Z", value: 90 },
    ];
    const out = bucketSeries(samples, "hour", { amplitude: true });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      t: "2026-05-01T00:00:00.000Z",
      avg: 90,
      min: 60,
      max: 120,
    });
  });

  it("omits min/max when amplitude is not requested", () => {
    const samples: Sample[] = [{ start: "2026-05-01T00:05:00Z", value: 60 }];
    const out = bucketSeries(samples, "hour");
    expect(out[0]).not.toHaveProperty("min");
    expect(out[0]).not.toHaveProperty("max");
  });

  it("buckets an instant-style record (end === null) by its start", () => {
    const samples: Sample[] = [
      { start: "2026-05-01T08:15:00Z", end: null, value: 5 },
    ];
    const out = bucketSeries(samples, "day");
    expect(out).toEqual([{ t: "2026-05-01T00:00:00.000Z", avg: 5 }]);
  });

  it("floors to Monday for weekly granularity", () => {
    // 2026-05-06 is a Wednesday; its week floors to Monday 2026-05-04.
    const samples: Sample[] = [{ start: "2026-05-06T12:00:00Z", value: 7 }];
    const out = bucketSeries(samples, "week");
    expect(out[0].t).toBe("2026-05-04T00:00:00.000Z");
  });
});

describe("builder ↔ allowlist contract (integration)", () => {
  it("produces a query the server allowlist accepts", () => {
    const q = buildTimeWindowQuery({
      start: "2026-05-01T00:00:00Z",
      end: "2026-05-08T00:00:00Z",
    });
    expect(passesAllowlist(q as Record<string, unknown>)).toBe(true);
  });

  it("rejects a hand-rolled query with a disallowed operator (sanity check)", () => {
    // Confirms the mirrored allowlist check actually rejects bad shapes, so the
    // positive assertion above is meaningful.
    expect(passesAllowlist({ start: { $where: "1" } })).toBe(false);
    expect(passesAllowlist({ data: { $gte: "x" } })).toBe(false);
  });
});
