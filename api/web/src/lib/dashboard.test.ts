import { describe, expect, it } from 'vitest';

import type { HealthRecord } from './api';
import {
  extractSamples,
  formatValue,
  groupPopulatedTypes,
  latestValue,
  shortWindow,
  SPARKLINE_WINDOW_DAYS,
  toSparklinePoints,
} from './dashboard';
import { getRecordType } from './recordTypes';
import type { TimeWindow } from './transforms';

/** Minimal record builder — only the fields the extractors read. */
function rec(
  partial: Partial<HealthRecord> & Pick<HealthRecord, 'start' | 'data'>,
): HealthRecord {
  return {
    _id: 'x',
    id: 'x',
    end: null,
    app: 'com.example',
    ...partial,
  };
}

const meta = (name: string) => {
  const m = getRecordType(name);
  if (!m) throw new Error(`unknown type ${name}`);
  return m;
};

describe('groupPopulatedTypes', () => {
  it('keeps only types with count > 0, grouped by category in fixed order', () => {
    const groups = groupPopulatedTypes({
      Steps: 1234, // Activity, charted
      Distance: 5, // Activity, not charted
      HeartRate: 42, // Vitals, charted
      Weight: 3, // Body, charted
      BodyFat: 0, // Body — dropped (zero)
      SleepSession: 7, // Sleep, charted
    });

    expect(groups.map((g) => g.category)).toEqual([
      'Activity',
      'Vitals',
      'Body',
      'Sleep',
    ]);
    const activity = groups[0];
    // Registry order within the category: Distance precedes Steps.
    expect(activity.types.map((t) => t.meta.name)).toEqual([
      'Distance',
      'Steps',
    ]);
    // count carried through
    expect(activity.types[1].count).toBe(1234);
    // Body only has Weight (BodyFat zero dropped)
    expect(groups[2].types.map((t) => t.meta.name)).toEqual(['Weight']);
  });

  it('drops unknown, zero, negative and non-number counts and empty categories', () => {
    const groups = groupPopulatedTypes({
      NotARealType: 99,
      Steps: -1,
      // @ts-expect-error exercising a malformed count value at runtime
      HeartRate: 'lots',
      Weight: 0,
    });
    expect(groups).toEqual([]);
  });

  it('returns [] for an empty counts map', () => {
    expect(groupPopulatedTypes({})).toEqual([]);
  });
});

describe('shortWindow', () => {
  it('spans the default 7 days ending at now', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const w = shortWindow(now);
    expect(w.end).toBe(now);
    expect((w.start as Date).toISOString()).toBe('2026-05-25T00:00:00.000Z');
    expect(SPARKLINE_WINDOW_DAYS).toBe(7);
  });

  it('honours a custom day count', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const w = shortWindow(now, 1);
    expect((w.start as Date).toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
});

describe('extractSamples', () => {
  it('reads the single numeric field for simple types (Steps)', () => {
    const r = rec({ start: '2026-05-26T08:00:00Z', data: { count: 500 } });
    expect(extractSamples(r, 'Steps')).toEqual([
      { start: '2026-05-26T08:00:00Z', value: 500 },
    ]);
  });

  it('reads energy for calorie types', () => {
    const r = rec({ start: '2026-05-26T08:00:00Z', data: { energy: 1234.5 } });
    expect(extractSamples(r, 'ActiveCaloriesBurned')[0].value).toBe(1234.5);
    expect(extractSamples(r, 'TotalCaloriesBurned')[0].value).toBe(1234.5);
  });

  it('flattens HeartRate samples into one point per beat sample', () => {
    const r = rec({
      start: '2026-05-26T08:00:00Z',
      data: {
        samples: [
          { time: '2026-05-26T08:00:00Z', beatsPerMinute: 60 },
          { time: '2026-05-26T08:01:00Z', beatsPerMinute: 72 },
          { time: '2026-05-26T08:02:00Z' }, // missing bpm → skipped
          { beatsPerMinute: 80 }, // missing time → skipped
        ],
      },
    });
    expect(extractSamples(r, 'HeartRate')).toEqual([
      { start: '2026-05-26T08:00:00Z', value: 60 },
      { start: '2026-05-26T08:01:00Z', value: 72 },
    ]);
  });

  it('returns [] for HeartRate without a samples array', () => {
    const r = rec({ start: '2026-05-26T08:00:00Z', data: {} });
    expect(extractSamples(r, 'HeartRate')).toEqual([]);
  });

  it('derives SleepSession duration in hours from start/end', () => {
    const r = rec({
      start: '2026-05-26T22:00:00Z',
      end: '2026-05-27T06:00:00Z',
      data: {},
    });
    expect(extractSamples(r, 'SleepSession')).toEqual([
      { start: '2026-05-26T22:00:00Z', value: 8 },
    ]);
  });

  it('returns [] for a SleepSession without an end', () => {
    const r = rec({ start: '2026-05-26T22:00:00Z', end: null, data: {} });
    expect(extractSamples(r, 'SleepSession')).toEqual([]);
  });

  it('returns [] for a non-numeric or missing field', () => {
    expect(
      extractSamples(rec({ start: 't', data: { count: 'x' } }), 'Steps'),
    ).toEqual([]);
    expect(extractSamples(rec({ start: 't', data: {} }), 'Steps')).toEqual([]);
  });

  it('returns [] for a type with no known value field', () => {
    expect(
      extractSamples(rec({ start: 't', data: { foo: 1 } }), 'Distance'),
    ).toEqual([]);
  });
});

describe('toSparklinePoints', () => {
  const window: TimeWindow = {
    start: '2026-05-25T00:00:00.000Z',
    end: '2026-06-01T00:00:00.000Z',
  };

  it('buckets a week window by day, averaging per bucket', () => {
    const records = [
      rec({ start: '2026-05-26T08:00:00Z', data: { count: 400 } }),
      rec({ start: '2026-05-26T20:00:00Z', data: { count: 600 } }),
      rec({ start: '2026-05-27T08:00:00Z', data: { count: 1000 } }),
    ];
    const points = toSparklinePoints(records, 'Steps', window);
    expect(points).toEqual([
      { t: '2026-05-26T00:00:00.000Z', avg: 500 },
      { t: '2026-05-27T00:00:00.000Z', avg: 1000 },
    ]);
  });

  it('keeps min/max for amplitude types (HeartRate)', () => {
    const records = [
      rec({
        start: '2026-05-26T08:00:00Z',
        data: {
          samples: [
            { time: '2026-05-26T08:00:00Z', beatsPerMinute: 60 },
            { time: '2026-05-26T09:00:00Z', beatsPerMinute: 90 },
          ],
        },
      }),
    ];
    const [point] = toSparklinePoints(records, 'HeartRate', window);
    expect(point.avg).toBe(75);
    expect(point.min).toBe(60);
    expect(point.max).toBe(90);
  });

  it('returns [] for no usable records', () => {
    expect(toSparklinePoints([], 'Steps', window)).toEqual([]);
  });
});

describe('latestValue', () => {
  it('returns the value of the most-recent sample by start', () => {
    const records = [
      rec({ start: '2026-05-26T08:00:00Z', data: { count: 400 } }),
      rec({ start: '2026-05-28T08:00:00Z', data: { count: 999 } }),
      rec({ start: '2026-05-27T08:00:00Z', data: { count: 700 } }),
    ];
    expect(latestValue(records, 'Steps')).toBe(999);
  });

  it('returns null when there are no samples', () => {
    expect(latestValue([], 'Steps')).toBeNull();
    expect(latestValue([rec({ start: 't', data: {} })], 'Steps')).toBeNull();
  });
});

describe('formatValue', () => {
  it('rounds large magnitudes to whole numbers with grouping', () => {
    expect(formatValue(1234.7, meta('Steps'))).toBe('1,235 steps');
    expect(formatValue(523.2, meta('ActiveCaloriesBurned'))).toBe('523 kcal');
  });

  it('keeps one decimal for small magnitudes', () => {
    expect(formatValue(70.45, meta('Weight'))).toBe('70.5 kg');
    expect(formatValue(7.5, meta('SleepSession'))).toBe('7.5 h');
  });

  it('omits the unit when the type has none', () => {
    // MindfulnessSession has no unit in the registry.
    expect(formatValue(3, meta('MindfulnessSession'))).toBe('3');
  });
});
