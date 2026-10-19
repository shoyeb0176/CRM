// The chart for each kind of data:
//   over time ............. TrendArea (a smooth line with a soft fill)
//   parts of a whole ...... Donut (total in the middle, each part's value and share listed)
//   stages of a process ... SegmentBar (one bar split by share, stages listed with counts)
//   a ranking ............. RankList (names with values and a thin bar, readable with one row)
//   up and down ........... DivergingBars (green above zero, red below)
//   outcomes per period ... StackedColumns (e.g. won and lost)
//   amounts per period .... Columns (optionally with a line over them)
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { short, words } from "./chart-kit";
import { colorFor, shares } from "./chart-math";

type Fmt = (n: number) => string;
const plain: Fmt = (n) => n.toLocaleString();
export type Part = { label: string; value: number; count?: number; color?: string };
export type Series = { key: string; label: string; color: string; dashed?: boolean };
type Row = Record<string, number | string>;

const coloured = (parts: Part[]) =>
  parts.map((p, i) => ({ ...p, color: p.color ?? colorFor(p.label, i) }));
const configOf = (series: Series[]) =>
  Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

/** Each part with a dot, its value, an optional count and its share of the total. */
function PartList({
  parts,
  format,
  unit,
}: {
  parts: Array<Part & { color: string }>;
  format: Fmt;
  unit?: [string, string];
}) {
  const pct = shares(parts.map((p) => p.value));
  return (
    <ul className="w-full space-y-2 text-sm">
      {parts.map((p, i) => (
        <li key={p.label} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="min-w-0 flex-1 truncate">{words(p.label)}</span>
          {p.count != null && unit && (
            <span className="text-xs text-muted-foreground">
              {p.count} {p.count === 1 ? unit[0] : unit[1]}
            </span>
          )}
          <span className="tabular-nums">{format(p.value)}</span>
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {pct[i]}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Donut({
  parts,
  format = plain,
  totalLabel = "Total",
}: {
  parts: Part[];
  format?: Fmt;
  totalLabel?: string;
}) {
  const data = coloured(parts.filter((p) => p.value > 0));
  const total = data.reduce((s, p) => s + p.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ChartContainer
          config={Object.fromEntries(
            data.map((p) => [p.label, { label: words(p.label), color: p.color }]),
          )}
          className="size-44"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="66%"
              outerRadius="100%"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((p) => (
                <Cell key={p.label} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{format(total)}</span>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <PartList parts={data} format={format} />
    </div>
  );
}

/** Stages in order: one bar split by share, then each stage's count and value. Fine with one stage. */
export function SegmentBar({
  parts,
  format = plain,
  unit = ["item", "items"],
}: {
  parts: Part[];
  format?: Fmt;
  unit?: [string, string];
}) {
  const data = coloured(parts);
  const pct = shares(data.map((p) => p.value));
  const total = data.reduce((s, p) => s + p.value, 0);
  const count = data.reduce((s, p) => s + (p.count ?? 0), 0);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-semibold tabular-nums">{format(total)}</div>
        {count > 0 && (
          <div className="text-xs text-muted-foreground">
            {count} {count === 1 ? unit[0] : unit[1]} across {data.length}{" "}
            {data.length === 1 ? "stage" : "stages"}
          </div>
        )}
      </div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={data.map((p, i) => `${words(p.label)} ${pct[i]}%`).join(", ")}
      >
        {data.map(
          (p, i) =>
            pct[i] > 0 && (
              <div
                key={p.label}
                style={{ width: `${pct[i]}%`, background: p.color }}
                title={`${words(p.label)}: ${format(p.value)}`}
              />
            ),
        )}
      </div>
      <PartList parts={data} format={format} unit={unit} />
    </div>
  );
}

/** Top N: name, value, and a thin bar against the largest. Replaces axis bar charts for rankings. */
export function RankList({
  data,
  format = plain,
  color = "var(--chart-2)",
}: {
  data: Array<{ label: string; value: number }>;
  format?: Fmt;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const pct = shares(data.map((d) => d.value));
  if (!data.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing to show for this period.
      </p>
    );
  return (
    <ol className="space-y-3">
      {data.map((d, i) => (
        <li key={d.label + i}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{words(d.label)}</span>
            <span className="tabular-nums">{format(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {pct[i]}%
            </span>
          </div>
          <div className="ml-7 mt-1 h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** What each line or colour means, under charts with more than one series. */
function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className="w-4 border-t-2"
            style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const axes = (x: string) => [
  <CartesianGrid key="g" vertical={false} />,
  <XAxis key="x" dataKey={x} tickLine={false} axisLine={false} />,
  <YAxis
    key="y"
    tickLine={false}
    axisLine={false}
    width={44}
    tickFormatter={short}
    allowDecimals={false}
  />,
  <ChartTooltip key="t" content={<ChartTooltipContent />} />,
];

/** One or two amounts over time. The second series can be dashed to read as the comparison. */
export function TrendArea({ data, x, series }: { data: Row[]; x: string; series: Series[] }) {
  return (
    <div>
      <ChartContainer config={configOf(series)} className="h-64 w-full">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.dashed ? 0.08 : 0.3} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {axes(x)}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              fill={`url(#fill-${s.key})`}
              dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
      <Legend series={series} />
    </div>
  );
}

/** Up and down per period: give `down` to draw a second series below zero (stock out), or leave it
 *  out and the single series is green when positive and red when negative (profit and loss). */
export function DivergingBars({
  data,
  x,
  up,
  down,
}: {
  data: Row[];
  x: string;
  up: Series;
  down?: Series;
}) {
  const rows = down
    ? data.map((r) => ({ ...r, [down.key]: -Math.abs(Number(r[down.key]) || 0) }))
    : data;
  return (
    <div>
      <ChartContainer config={configOf(down ? [up, down] : [up])} className="h-64 w-full">
        <BarChart data={rows} stackOffset="sign" margin={{ left: 0, right: 8, top: 8 }}>
          {axes(x)}
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar
            dataKey={up.key}
            stackId="a"
            fill={`var(--color-${up.key})`}
            isAnimationActive={false}
          >
            {!down &&
              rows.map((r, i) => (
                <Cell
                  key={i}
                  fill={Number(r[up.key]) < 0 ? "var(--destructive)" : "var(--success)"}
                />
              ))}
          </Bar>
          {down && (
            <Bar
              dataKey={down.key}
              stackId="a"
              fill={`var(--color-${down.key})`}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ChartContainer>
      <Legend series={down ? [up, down] : [up]} />
    </div>
  );
}

/** Outcomes that add up per period, stacked: won on lost, done on late. */
export function StackedColumns({ data, x, series }: { data: Row[]; x: string; series: Series[] }) {
  return (
    <div>
      <ChartContainer config={configOf(series)} className="h-64 w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          {axes(x)}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={`var(--color-${s.key})`}
              maxBarSize={36}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <Legend series={series} />
    </div>
  );
}

/** Amounts per period side by side, with an optional line over them (hours with billable hours). */
export function Columns({
  data,
  x,
  bar,
  line,
}: {
  data: Row[];
  x: string;
  bar: Series;
  line?: Series;
}) {
  return (
    <div>
      <ChartContainer config={configOf(line ? [bar, line] : [bar])} className="h-64 w-full">
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          {axes(x)}
          <Bar
            dataKey={bar.key}
            fill={`var(--color-${bar.key})`}
            maxBarSize={36}
            isAnimationActive={false}
          />
          {line && (
            <Line
              dataKey={line.key}
              type="monotone"
              stroke={`var(--color-${line.key})`}
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>
      <Legend series={line ? [bar, line] : [bar]} />
    </div>
  );
}
