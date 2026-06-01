// Pure logic for the per-type detail view. Everything here is
// side-effect free (no fetch, no global state) so it lands under the
// `src/lib/**` coverage gate and is fully unit-testable. The detail route and
// its components are thin shells over these helpers.
//
//  - Window presets: the view is bound to a `start`/`end` window (default last
//    7 days). `defaultWindowSearch`/`windowForPreset` build the
//    typed search-param window; `presetForWindow` maps a window back to the
//    selector's day/week/month segment so the active segment can be highlighted.
//  - Table rows: `toTableRows` projects records to the readable columns
//    (start/end/app), `sortRows` + `paginate` do the client-side sort/pagination
//    over the returned window (no server-side paging).
//  - `isWideWindow` drives the heavy-type wide-window notice.
//  - `prettyJson`/`formatTimestamp` render the JSON dialog and friendly dates.
//
// Charts reuse `dashboard.toSparklinePoints` (already keeps amplitude min/max)
// and the `transforms` bucketing — this module does NOT re-implement bucketing.

import type { HealthRecord } from "./api";
import type { TimeWindow } from "./transforms";

const MS_PER_DAY = 86_400_000;

/** The window-selector segments. */
export type WindowPreset = "day" | "week" | "month";

export const WINDOW_PRESETS: readonly WindowPreset[] = [
  "day",
  "week",
  "month",
] as const;

/** Span, in days, each preset covers. The default view is the 7-day "week". */
const PRESET_DAYS: Readonly<Record<WindowPreset, number>> = {
  day: 1,
  week: 7,
  month: 30,
};

/** Default span (days) when no/invalid search-param is supplied. */
export const DEFAULT_WINDOW_DAYS = PRESET_DAYS.week;

/** The typed `start`/`end` search-param window (both ISO-8601 UTC). */
export interface WindowSearch {
  start: string;
  end: string;
}

/** A window ending at `now` covering `days` (clamped to ≥1 day). */
function windowEndingNow(now: Date, days: number): WindowSearch {
  const end = now;
  const safeDays = days >= 1 ? days : 1;
  return {
    start: new Date(end.getTime() - safeDays * MS_PER_DAY).toISOString(),
    end: end.toISOString(),
  };
}

/** The default last-7-days window ending at `now`. */
export function defaultWindowSearch(now: Date): WindowSearch {
  return windowEndingNow(now, DEFAULT_WINDOW_DAYS);
}

/** The window for a selector preset (day/week/month) ending at `now`. */
export function windowForPreset(preset: WindowPreset, now: Date): WindowSearch {
  return windowEndingNow(now, PRESET_DAYS[preset]);
}

/**
 * Normalise a raw search-param object to a valid `WindowSearch`. Missing or
 * non-ISO-parseable bounds, or an inverted range, fall back to the default
 * last-7-days window so the route always has a usable, allowlist-safe window.
 */
export function normalizeWindowSearch(
  raw: { start?: unknown; end?: unknown },
  now: Date,
): WindowSearch {
  const start = isoOrNull(raw.start);
  const end = isoOrNull(raw.end);
  if (start === null || end === null || start >= end) {
    return defaultWindowSearch(now);
  }
  return { start, end };
}

/** A finite ISO timestamp (round-tripped to canonical UTC) or `null`. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Which preset a window's span matches, for highlighting the active selector
 * segment. Spans are matched with a ±1-day tolerance (windows are anchored to
 * "now", so the exact millisecond span drifts); a non-matching span → `null`.
 */
export function presetForWindow(window: WindowSearch): WindowPreset | null {
  const spanDays =
    (Date.parse(window.end) - Date.parse(window.start)) / MS_PER_DAY;
  for (const preset of WINDOW_PRESETS) {
    if (Math.abs(spanDays - PRESET_DAYS[preset]) <= 1) return preset;
  }
  return null;
}

/** A `WindowSearch` as the `TimeWindow` the query layer/bucketing consumes. */
export function toTimeWindow(window: WindowSearch): TimeWindow {
  return { start: window.start, end: window.end };
}

/** One readable table row projected from a record. */
export interface TableRow {
  id: string;
  start: string;
  end: string | null;
  app: string;
  record: HealthRecord;
}

/** Project records to readable rows (start/end/app + the full record). */
export function toTableRows(records: HealthRecord[]): TableRow[] {
  return records.map((record) => ({
    id: record._id,
    start: record.start,
    end: record.end,
    app: record.app,
    record,
  }));
}

export type SortDirection = "asc" | "desc";

/**
 * Sort rows by `start` (ISO-8601 strings sort lexicographically, TechSpec
 * Known Risks). Returns a new array; default is most-recent-first (`desc`).
 */
export function sortRows(
  rows: TableRow[],
  direction: SortDirection = "desc",
): TableRow[] {
  const sorted = [...rows].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  return direction === "asc" ? sorted : sorted.reverse();
}

/** Default rows per page for the client-side pagination. */
export const DEFAULT_PAGE_SIZE = 25;

/** Total pages for `total` rows at `pageSize` (always ≥1). */
export function pageCount(
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * The `page` slice (1-based) of `rows` at `pageSize`. `page` is clamped into
 * `[1, pageCount]` so an out-of-range page never yields an empty slice when
 * rows exist.
 */
export function paginate(
  rows: TableRow[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): TableRow[] {
  const pages = pageCount(rows.length, pageSize);
  const clamped = Math.min(Math.max(1, Math.trunc(page)), pages);
  const start = (clamped - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/**
 * High-frequency types whose collections can hold thousands of docs per window
 * — the ones the wide-window notice warns about. Sampled vitals
 * and per-step/second activity streams.
 */
export const HEAVY_TYPES: ReadonlySet<string> = new Set([
  "HeartRate",
  "RestingHeartRate",
  "Steps",
  "Distance",
  "ActiveCaloriesBurned",
  "TotalCaloriesBurned",
  "Speed",
  "Power",
  "StepsCadence",
  "CyclingPedalingCadence",
]);

/** Span beyond which a heavy type triggers the wide-window notice (days). */
export const WIDE_WINDOW_DAYS = 14;

/**
 * Whether to show the wide-window performance notice: a heavy type over a span
 * wider than `WIDE_WINDOW_DAYS`. The default 7-day window never trips it; a
 * month-wide window on HeartRate does.
 */
export function isWideWindow(window: WindowSearch, typeName: string): boolean {
  if (!HEAVY_TYPES.has(typeName)) return false;
  const spanDays =
    (Date.parse(window.end) - Date.parse(window.start)) / MS_PER_DAY;
  return spanDays > WIDE_WINDOW_DAYS;
}

/** Pretty-print the full decrypted record for the JSON detail dialog. */
export function prettyJson(record: HealthRecord): string {
  return JSON.stringify(record, null, 2);
}

/**
 * Friendly date/time for a record bound. Instant-style records carry `null`
 * for `end`; render those as an em dash rather than "Invalid Date".
 */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
