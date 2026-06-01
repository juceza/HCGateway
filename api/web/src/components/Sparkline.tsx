import { Line, LineChart } from 'recharts';

import type { ChartPoint } from '@/lib/transforms';

// Mini trend sparkline for the dashboard summary cards. Built on the
// same Recharts engine the rich detail charts (task_08) use, but kept
// deliberately bare — fixed size, no axes/grid/tooltip/animation — so it reads
// at a glance and renders cheaply. It consumes the already-downsampled
// `ChartPoint[]` from `toSparklinePoints`, plotting the per-bucket average.
// Colour comes from the design-system primary token via `currentColor`.

interface SparklineProps {
  points: ChartPoint[];
  width?: number;
  height?: number;
}

export function Sparkline({
  points,
  width = 120,
  height = 36,
}: SparklineProps) {
  return (
    <div data-testid='sparkline' className='text-primary'>
      <LineChart
        width={width}
        height={height}
        data={points}
        margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
      >
        <Line
          type='monotone'
          dataKey='avg'
          stroke='currentColor'
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
