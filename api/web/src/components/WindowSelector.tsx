import { WINDOW_PRESETS, type WindowPreset } from '@/lib/recordDetail';

import { Button } from '@/components/ui/button';

// Day/week/month window selector driving the detail view's `start`/`end`
// search-param window. It is presentational: the route owns the
// typed search-param and re-navigates on change, which re-keys `useRecords` and
// refetches. The active segment is highlighted from `active` (derived by
// `presetForWindow`); a custom span leaves all segments inactive.

const PRESET_LABELS: Record<WindowPreset, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

interface WindowSelectorProps {
  active: WindowPreset | null;
  onSelect: (preset: WindowPreset) => void;
}

export function WindowSelector({ active, onSelect }: WindowSelectorProps) {
  return (
    <div
      data-testid='window-selector'
      role='group'
      aria-label='Time window'
      className='bg-muted inline-flex gap-1 rounded-lg p-1'
    >
      {WINDOW_PRESETS.map((preset) => (
        <Button
          key={preset}
          type='button'
          size='sm'
          variant={active === preset ? 'default' : 'ghost'}
          aria-pressed={active === preset}
          data-testid={`window-${preset}`}
          onClick={() => onSelect(preset)}
        >
          {PRESET_LABELS[preset]}
        </Button>
      ))}
    </div>
  );
}
