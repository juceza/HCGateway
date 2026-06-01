import { describe, expect, it } from 'vitest';

import type { HealthRecord } from './api';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_WINDOW_DAYS,
  defaultWindowSearch,
  formatTimestamp,
  isWideWindow,
  normalizeWindowSearch,
  pageCount,
  paginate,
  presetForWindow,
  prettyJson,
  sortRows,
  toTableRows,
  toTimeWindow,
  windowForPreset,
} from './recordDetail';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const MS_PER_DAY = 86_400_000;

function rec(
  id: string,
  start: string,
  end: string | null = null,
): HealthRecord {
  return { _id: id, id, data: { v: 1 }, start, end, app: 'com.example' };
}

function spanDays(w: { start: string; end: string }): number {
  return (Date.parse(w.end) - Date.parse(w.start)) / MS_PER_DAY;
}

describe('window presets', () => {
  it('defaults to a last-7-days window ending at now', () => {
    const w = defaultWindowSearch(NOW);
    expect(w.end).toBe(NOW.toISOString());
    expect(spanDays(w)).toBe(DEFAULT_WINDOW_DAYS);
    expect(DEFAULT_WINDOW_DAYS).toBe(7);
  });

  it('builds day/week/month windows from a preset', () => {
    expect(spanDays(windowForPreset('day', NOW))).toBe(1);
    expect(spanDays(windowForPreset('week', NOW))).toBe(7);
    expect(spanDays(windowForPreset('month', NOW))).toBe(30);
    expect(windowForPreset('day', NOW).end).toBe(NOW.toISOString());
  });

  it('matches a window span back to its preset (±1 day tolerance)', () => {
    expect(presetForWindow(windowForPreset('day', NOW))).toBe('day');
    expect(presetForWindow(windowForPreset('week', NOW))).toBe('week');
    expect(presetForWindow(windowForPreset('month', NOW))).toBe('month');
  });

  it('returns null for a custom span outside any preset', () => {
    const custom = {
      start: new Date(NOW.getTime() - 100 * MS_PER_DAY).toISOString(),
      end: NOW.toISOString(),
    };
    expect(presetForWindow(custom)).toBeNull();
  });

  it('exposes the window as a TimeWindow for the query layer', () => {
    const w = windowForPreset('week', NOW);
    expect(toTimeWindow(w)).toEqual({ start: w.start, end: w.end });
  });
});

describe('normalizeWindowSearch', () => {
  it('defaults to last-7-days when params are missing', () => {
    const w = normalizeWindowSearch({}, NOW);
    expect(spanDays(w)).toBe(7);
    expect(w.end).toBe(NOW.toISOString());
  });

  it('defaults when a bound is not a parseable ISO string', () => {
    const w = normalizeWindowSearch({ start: 'nope', end: 42 }, NOW);
    expect(spanDays(w)).toBe(7);
  });

  it('defaults when the range is inverted (start >= end)', () => {
    const w = normalizeWindowSearch(
      { start: '2026-06-02T00:00:00Z', end: '2026-06-01T00:00:00Z' },
      NOW,
    );
    expect(spanDays(w)).toBe(7);
  });

  it('keeps a valid range, normalised to canonical UTC', () => {
    const w = normalizeWindowSearch(
      { start: '2026-05-01T00:00:00Z', end: '2026-05-08T00:00:00Z' },
      NOW,
    );
    expect(w).toEqual({
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-08T00:00:00.000Z',
    });
  });
});

describe('table rows, sort and pagination', () => {
  const records = [
    rec('a', '2026-05-01T10:00:00Z', '2026-05-01T11:00:00Z'),
    rec('b', '2026-05-03T10:00:00Z'),
    rec('c', '2026-05-02T10:00:00Z'),
  ];

  it('projects records to readable rows (start/end/app)', () => {
    const rows = toTableRows(records);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({
      start: '2026-05-01T10:00:00Z',
      end: '2026-05-01T11:00:00Z',
      app: 'com.example',
    });
    expect(rows[1].end).toBeNull();
  });

  it('sorts rows by start, most-recent-first by default', () => {
    const rows = sortRows(toTableRows(records));
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts ascending when asked', () => {
    const rows = sortRows(toTableRows(records), 'asc');
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the input array', () => {
    const rows = toTableRows(records);
    const snapshot = rows.map((r) => r.id);
    sortRows(rows, 'asc');
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });

  it('computes page count (always >= 1)', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(DEFAULT_PAGE_SIZE)).toBe(1);
    expect(pageCount(DEFAULT_PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(10, 4)).toBe(3);
  });

  it('pages over the returned window and clamps out-of-range pages', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      rec(`r${i}`, new Date(NOW.getTime() - i * 1000).toISOString()),
    );
    const rows = toTableRows(many);
    expect(paginate(rows, 1)).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(paginate(rows, 2)).toHaveLength(30 - DEFAULT_PAGE_SIZE);
    // Out-of-range page clamps to the last page rather than yielding [].
    expect(paginate(rows, 99)).toHaveLength(30 - DEFAULT_PAGE_SIZE);
    expect(paginate(rows, 0, 10)).toHaveLength(10);
  });
});

describe('wide-window notice', () => {
  it('trips for a heavy type over a wide span', () => {
    const month = windowForPreset('month', NOW);
    expect(isWideWindow(month, 'HeartRate')).toBe(true);
  });

  it('does not trip for the default 7-day window', () => {
    const week = windowForPreset('week', NOW);
    expect(isWideWindow(week, 'HeartRate')).toBe(false);
  });

  it('never trips for a non-heavy type, even on a wide span', () => {
    const month = windowForPreset('month', NOW);
    expect(isWideWindow(month, 'Weight')).toBe(false);
  });
});

describe('json + timestamp formatting', () => {
  it('pretty-prints the full record with 2-space indent', () => {
    const out = prettyJson(rec('a', '2026-05-01T10:00:00Z'));
    expect(out).toContain('\n  "_id": "a"');
    expect(out).toBe(JSON.stringify(rec('a', '2026-05-01T10:00:00Z'), null, 2));
  });

  it('renders a friendly date and an em dash for null/invalid', () => {
    expect(formatTimestamp('2026-05-01T10:00:00Z')).toMatch(/2026/);
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('not-a-date')).toBe('—');
  });
});
