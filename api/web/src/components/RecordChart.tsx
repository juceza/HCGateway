import {
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { toSparklinePoints } from '@/lib/dashboard';
import { formatTimestamp } from '@/lib/recordDetail';
import type { RecordTypeMeta } from '@/lib/recordTypes';
import type { ChartPoint, TimeWindow } from '@/lib/transforms';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';

// Rich trend chart for the 8 charted high-value types. It
// reuses the shared temporal bucketing (`toSparklinePoints`) so values are the
// per-bucket average — never raw JSON — in the type's friendly unit. Amplitude
// types (HeartRate / RestingHeartRate) additionally carry per-bucket min/max,
// which `toSparklinePoints` preserves; this component draws them as faint
// bounding lines around the average so peaks/troughs stay visible.
//
// `data-points`/`data-amplitude` and the sr-only caption expose the reduced
// series for assertions and screen readers without depending on Recharts' SVG.

interface RecordChartProps {
  records: Parameters<typeof toSparklinePoints>[0];
  meta: RecordTypeMeta;
  window: TimeWindow;
}

const CHART_CONFIG: ChartConfig = {
  avg: { label: 'Average', color: 'var(--chart-1, var(--primary))' },
  min: { label: 'Min', color: 'var(--muted-foreground)' },
  max: { label: 'Max', color: 'var(--muted-foreground)' },
};

/** Overall min/max across the reduced series, for the accessible caption. */
function seriesExtent(points: ChartPoint[], amplitude: boolean) {
  if (points.length === 0) return null;
  const mins = points.map((p) =>
    amplitude && p.min !== undefined ? p.min : p.avg,
  );
  const maxs = points.map((p) =>
    amplitude && p.max !== undefined ? p.max : p.avg,
  );
  return { min: Math.min(...mins), max: Math.max(...maxs) };
}

export function RecordChart({ records, meta, window }: RecordChartProps) {
  const points = toSparklinePoints(records, meta.name, window);
  const amplitude = points.some((p) => p.min !== undefined);
  const extent = seriesExtent(points, amplitude);
  const unit = meta.unit ? ` ${meta.unit}` : '';

  const round = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? `${Math.round(n * 10) / 10}${unit}` : '';
  };

  return (
    <figure
      data-testid='record-chart'
      data-points={points.length}
      data-amplitude={amplitude}
      className='w-full'
    >
      <ChartContainer config={CHART_CONFIG} className='max-h-72 w-full'>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey='t'
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={(t) => formatTimestamp(String(t))}
          />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <Tooltip
            content={(props) => (
              <ChartTooltipContent
                {...props}
                config={CHART_CONFIG}
                labelFormatter={(l) =>
                  formatTimestamp(l == null ? null : String(l))
                }
                valueFormatter={round}
              />
            )}
          />
          {amplitude && (
            <Line
              dataKey='max'
              type='monotone'
              stroke='var(--color-max)'
              strokeWidth={1}
              strokeDasharray='3 3'
              dot={false}
              isAnimationActive={false}
            />
          )}
          {amplitude && (
            <Line
              dataKey='min'
              type='monotone'
              stroke='var(--color-min)'
              strokeWidth={1}
              strokeDasharray='3 3'
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey='avg'
            type='monotone'
            stroke='var(--color-avg)'
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <figcaption className='sr-only' data-testid='chart-caption'>
        {extent
          ? `${meta.label}: ${points.length} points, ` +
            `${amplitude ? 'min ' : 'low '}${Math.round(extent.min * 10) / 10}${unit} to ` +
            `${amplitude ? 'max ' : 'high '}${Math.round(extent.max * 10) / 10}${unit}.`
          : `${meta.label}: no data in this window.`}
      </figcaption>
    </figure>
  );
}
