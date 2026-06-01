// Pure data transforms that bind every data view to a time window and keep
// heavy record types responsive. Two responsibilities, both side-effect free
// (no fetch, no global state) so they are fully unit-testable:
//
//  1. `buildTimeWindowQuery` — turn a `{start, end}` window into an
//     `AllowlistedQuery` the server's `_sanitize_query` accepts. The builder is
//     the seam where type-safety prevents allowlist 400s: it only ever emits the
//     `start` field with `$gte`/`$lte` ISO-8601 UTC bounds.
//  2. `deriveGranularity` + `bucketSeries` — temporal bucketing/downsampling.
//     Because `/fetch` has no server-side pagination/sort/limit, the
//     client downloads the whole window and reduces it here: the window size
//     picks a bucket granularity, each bucket is averaged, and amplitude types
//     (HeartRate) additionally keep per-bucket min/max so extremes survive.
//
// Bounds rely on the lexicographic ordering of ISO-8601 UTC `start` strings
// (every record `start` is `Instant.toString()` → `...Z`), so normalising to
// `Date.toISOString()` keeps comparisons correct (TechSpec Known Risks).

import type { AllowlistedQuery } from "./api";

/** A half-open time window. Each bound is a `Date` or an ISO-8601 string. */
export interface TimeWindow {
  start: Date | string;
  end: Date | string;
}

/** Bucket size for downsampling, derived from the window span. */
export type Granularity = "hour" | "day" | "week";

/**
 * One sample fed into the bucketer. `start` is the timestamp the sample is
 * keyed by (always present); `end` is carried only to mirror the record shape
 * and is ignored — instant-style records (`end === null`) bucket by `start`.
 */
export interface Sample {
  start: string;
  end?: string | null;
  value: number;
}

/** A downsampled chart point. `min`/`max` are present only for amplitude types. */
export interface ChartPoint {
  t: string;
  avg: number;
  min?: number;
  max?: number;
}

interface BucketOptions {
  /** Keep per-bucket min/max (amplitude types such as HeartRate). */
  amplitude?: boolean;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Normalise a `Date`/string bound to a canonical ISO-8601 UTC string (`...Z`). */
function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Build the allowlisted `/fetch` filter for a time window. Emits only the
 * `start` field with `$gte`/`$lte` ISO bounds — never a field or operator
 * outside the server allowlist, so it can never trigger a 400.
 */
export function buildTimeWindowQuery(window: TimeWindow): AllowlistedQuery {
  return { start: { $gte: toIso(window.start), $lte: toIso(window.end) } };
}

/**
 * Pick a bucket granularity from the window span: hourly up to ~1.5 days
 * (a 1-day window), daily up to ~3 months (week/month windows), weekly beyond.
 */
export function deriveGranularity(window: TimeWindow): Granularity {
  const span =
    new Date(toIso(window.end)).getTime() -
    new Date(toIso(window.start)).getTime();
  if (span <= 36 * MS_PER_HOUR) return "hour";
  if (span <= 92 * MS_PER_DAY) return "day";
  return "week";
}

/** Floor an ISO timestamp to the start of its bucket, in UTC. */
function floorToBucket(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === "hour") {
    d.setUTCMinutes(0, 0, 0);
  } else if (granularity === "day") {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    // Week: floor to the most recent Monday (UTC).
    d.setUTCHours(0, 0, 0, 0);
    const daysSinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  }
  return d.toISOString();
}

/**
 * Bucket a window-filtered series into chart points. Each sample is keyed by
 * its `start` floored to the bucket boundary; values within a bucket are
 * averaged. With `amplitude`, each bucket also carries the min/max of its
 * values so peaks/troughs survive the reduction.
 *
 * Pure and deterministic: empty input → `[]`; a single sample → one bucket;
 * output is ordered ascending by `t`.
 */
export function bucketSeries(
  samples: Sample[],
  granularity: Granularity,
  opts: BucketOptions = {},
): ChartPoint[] {
  if (samples.length === 0) return [];

  const buckets = new Map<string, number[]>();
  for (const sample of samples) {
    const key = floorToBucket(sample.start, granularity);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(sample.value);
    } else {
      buckets.set(key, [sample.value]);
    }
  }

  const points: ChartPoint[] = [];
  for (const [t, values] of buckets) {
    const sum = values.reduce((acc, v) => acc + v, 0);
    const point: ChartPoint = { t, avg: sum / values.length };
    if (opts.amplitude) {
      point.min = Math.min(...values);
      point.max = Math.max(...values);
    }
    points.push(point);
  }

  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return points;
}
