// Pure dashboard helpers — the counts-driven, overview-first home.
//
// The home renders one card per record type with `count > 0`, grouped by the
// six fixed categories. The 8 charted types additionally show a recent value +
// a mini-sparkline driven by a short fixed window per-type `/fetch`; every
// other card shows only label + count and issues no `/fetch`.
//
// Everything here is side-effect free (no fetch, no global state) so it lands
// under the `src/lib/**` coverage gate and is fully unit-testable:
//
//  - `groupPopulatedTypes` turns the `/counts` map into ordered category groups.
//  - `shortWindow` builds the 7-day sparkline window.
//  - `extractSamples`/`latestValue`/`toSparklinePoints` pull the chartable
//    numeric value out of each charted type's record `data` shape (mirroring the
//    Android serializer), tolerating malformed records by returning `[]`.
//  - `formatValue` renders a value with its friendly unit.

import type { HealthRecord } from './api';
import {
  RECORD_CATEGORIES,
  type RecordCategory,
  type RecordTypeMeta,
  recordTypesByCategory,
} from './recordTypes';
import {
  bucketSeries,
  type ChartPoint,
  deriveGranularity,
  type Sample,
  type TimeWindow,
} from './transforms';

/** A record type present in `/counts` with a positive count. */
export interface PopulatedType {
  meta: RecordTypeMeta;
  count: number;
}

/** A non-empty category section for the dashboard. */
export interface CategoryGroup {
  category: RecordCategory;
  types: PopulatedType[];
}

/** Short fixed window (days) the home sparklines cover. */
export const SPARKLINE_WINDOW_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * Group the populated types (`count > 0`) by category, in fixed category order
 * and registry order within each. Unknown types, and zero/negative/non-number
 * counts, are dropped; empty categories are omitted so the home shows only what
 * actually has data.
 */
export function groupPopulatedTypes(
  counts: Record<string, number>,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const category of RECORD_CATEGORIES) {
    const types: PopulatedType[] = [];
    for (const meta of recordTypesByCategory(category)) {
      const count = counts[meta.name];
      if (typeof count === 'number' && count > 0) {
        types.push({ meta, count });
      }
    }
    if (types.length > 0) groups.push({ category, types });
  }
  return groups;
}

/** The short window ending at `now` that the home sparklines are bound to. */
export function shortWindow(
  now: Date,
  days: number = SPARKLINE_WINDOW_DAYS,
): TimeWindow {
  return { start: new Date(now.getTime() - days * MS_PER_DAY), end: now };
}

/**
 * Where each charted type's numeric value lives in the decrypted record `data`
 * (mirroring `RecordSerializer.kt`). Types with a per-sample or derived shape
 * (HeartRate, SleepSession) are handled explicitly in `extractSamples`.
 */
const VALUE_FIELD: Readonly<Record<string, string>> = {
  ActiveCaloriesBurned: 'energy',
  TotalCaloriesBurned: 'energy',
  BodyFat: 'percentage',
  RestingHeartRate: 'beatsPerMinute',
  Steps: 'count',
  Weight: 'weight',
};

/** Charted types whose sparkline keeps per-bucket min/max. */
const AMPLITUDE_TYPES: ReadonlySet<string> = new Set([
  'HeartRate',
  'RestingHeartRate',
]);

/** Read a finite number at `key` of an unknown object, or `null`. */
function numberAt(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Extract the chartable numeric samples from one record for a charted type.
 * Returns `[]` for shapes carrying no usable value, so a single malformed
 * record never breaks the sparkline:
 *
 *  - HeartRate → one sample per `data.samples[].beatsPerMinute` (keyed by the
 *    sample `time`).
 *  - SleepSession → session duration in hours, from the record `start`/`end`.
 *  - everything else → the single `data.<field>` numeric value, keyed by the
 *    record `start`.
 */
export function extractSamples(
  record: HealthRecord,
  typeName: string,
): Sample[] {
  if (typeName === 'HeartRate') {
    const samples = record.data.samples;
    if (!Array.isArray(samples)) return [];
    return samples.flatMap((s) => {
      const value = numberAt(s, 'beatsPerMinute');
      const time =
        s && typeof s === 'object'
          ? (s as Record<string, unknown>).time
          : undefined;
      return value !== null && typeof time === 'string'
        ? [{ start: time, value }]
        : [];
    });
  }
  if (typeName === 'SleepSession') {
    if (!record.end) return [];
    const hours =
      (new Date(record.end).getTime() - new Date(record.start).getTime()) /
      3_600_000;
    return Number.isFinite(hours) && hours > 0
      ? [{ start: record.start, value: hours }]
      : [];
  }
  const field = VALUE_FIELD[typeName];
  if (!field) return [];
  const value = numberAt(record.data, field);
  return value !== null ? [{ start: record.start, value }] : [];
}

/** Flatten all chartable samples for a type across the fetched records. */
function allSamples(records: HealthRecord[], typeName: string): Sample[] {
  return records.flatMap((r) => extractSamples(r, typeName));
}

/**
 * Downsample a type's records into sparkline points over the given window via
 * the shared temporal bucketing, keeping min/max for amplitude types.
 * Empty/unusable input → `[]`.
 */
export function toSparklinePoints(
  records: HealthRecord[],
  typeName: string,
  window: TimeWindow,
): ChartPoint[] {
  const samples = allSamples(records, typeName);
  return bucketSeries(samples, deriveGranularity(window), {
    amplitude: AMPLITUDE_TYPES.has(typeName),
  });
}

/** The most-recent sample value for a type, or `null` when there is none. */
export function latestValue(
  records: HealthRecord[],
  typeName: string,
): number | null {
  const samples = allSamples(records, typeName);
  if (samples.length === 0) return null;
  let latest = samples[0];
  for (const s of samples) {
    if (s.start > latest.start) latest = s;
  }
  return latest.value;
}

/**
 * Format a numeric value with its type's friendly unit. Magnitudes ≥ 100 round
 * to whole numbers with thousands grouping (steps, calories); smaller ones keep
 * one decimal (weight, body fat, sleep hours).
 */
export function formatValue(value: number, meta: RecordTypeMeta): string {
  const rounded =
    Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const num = rounded.toLocaleString('en-US');
  return meta.unit ? `${num} ${meta.unit}` : num;
}
