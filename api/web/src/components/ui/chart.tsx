import * as React from "react"
import { ResponsiveContainer } from "recharts"

import { cn } from "@/lib/utils"

// Trimmed shadcn/ui Chart wrapper over Recharts. `ChartContainer`
// injects each series' colour as a CSS variable (`--color-<key>`) from the
// `ChartConfig`, so the Recharts elements reference design-system tokens via
// `var(--color-avg)` instead of hardcoded hex. The full shadcn legend/style
// machinery is intentionally omitted — this V1 renders a single line (plus an
// optional amplitude band) and a tooltip.

export interface ChartSeriesConfig {
  label: string
  color: string
}

export type ChartConfig = Record<string, ChartSeriesConfig>

function configStyle(config: ChartConfig): React.CSSProperties {
  const vars: Record<string, string> = {}
  for (const [key, series] of Object.entries(config)) {
    vars[`--color-${key}`] = series.color
  }
  return vars as React.CSSProperties
}

function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ReactElement
}) {
  return (
    <div
      data-slot="chart"
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50",
        className,
      )}
      style={configStyle(config)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

interface TooltipPayloadItem {
  // Recharts allows a function dataKey; we only ever read it as a label key.
  dataKey?: string | number | ((obj: unknown) => unknown)
  name?: string | number
  // Recharts' ValueType (number | string | array); we only render scalars.
  value?: unknown
  color?: string
}

/**
 * Minimal Recharts tooltip body styled by the design system. Recharts injects
 * `active`/`payload`/`label`; `labelFormatter`/`valueFormatter` render friendly
 * strings. Returns `null` when inactive so nothing paints off-hover.
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean
  payload?: readonly TooltipPayloadItem[]
  label?: string | number
  config: ChartConfig
  labelFormatter?: (label: string | number | undefined) => string
  valueFormatter?: (value: unknown) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">
        {labelFormatter ? labelFormatter(label) : String(label ?? "")}
      </p>
      {payload.map((item, i) => {
        const rawKey =
          typeof item.dataKey === "string" || typeof item.dataKey === "number"
            ? item.dataKey
            : (item.name ?? i)
        const key = String(rawKey)
        const series = config[key]
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {series?.label ?? key}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {valueFormatter ? valueFormatter(item.value) : String(item.value ?? "")}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export { ChartContainer, ChartTooltipContent }
