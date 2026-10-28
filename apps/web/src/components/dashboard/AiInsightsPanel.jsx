"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";

const CHART_INK = "#292622";
const CHART_MUTED = "#77716a";
const CHART_GRID = "#E4DED6";
const CHART_BROWN = "#9a7958";
const CHART_BROWN_DARK = "#70563f";
const CHART_GOLD = "#c7ae8a";
const CHART_SAND = "#e8ded0";

const tooltipStyle = {
  background: "#FAF8F4",
  border: `1px solid ${CHART_GRID}`,
  borderRadius: 10,
  boxShadow: "0 2px 10px rgb(41 38 34 / 6%)",
  fontSize: 12,
  color: CHART_INK,
};

/** @param {{ title: string, summary?: string, children: import("react").ReactNode, className?: string }} props */
function ChartCard({ title, summary, children, className }) {
  return (
    <section
      className={cn(
        "surface-card relative overflow-hidden p-4 md:p-5",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-champagne/70 to-transparent"
        aria-hidden
      />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h3>
          {summary ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{summary}</p>
          ) : null}
        </div>
      </div>
      <div className="h-[220px] w-full sm:h-[240px]">{children}</div>
    </section>
  );
}

/**
 * @param {{
 *   insights: {
 *     volume_trend?: Array<Record<string, unknown>>,
 *     channel_bars?: Array<{ channel: string, conversations: number, color?: string }>,
 *     response_histogram?: Array<{ bucket: string, count: number }>,
 *     automation_mix?: Array<{ name: string, value: number, color?: string }>,
 *     lead_funnel?: Array<{ stage: string, value: number }>,
 *     summary?: string,
 *     range_days?: number,
 *   } | null,
 *   className?: string,
 * }} props
 */
export function AiInsightsPanel({ insights, className }) {
  if (!insights) return null;

  const volume = insights.volume_trend || [];
  const channels = insights.channel_bars || [];
  const histogram = insights.response_histogram || [];
  const mix = insights.automation_mix || [];
  const funnel = insights.lead_funnel || [];
  const days = insights.range_days || 14;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            AI Insights
          </p>
          <h2 className="font-display text-[1.65rem] leading-tight tracking-[-0.02em] text-ink md:text-[1.85rem]">
            Analytics pulse
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {insights.summary ||
              `Channel mix, volume, response time, and automation mode over the last ${days} days.`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Conversation volume"
          summary={`Inbound vs AI replies · last ${days} days`}
          className="fade-rise lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volume} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="triadaInbound" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_BROWN} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_BROWN} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="triadaAi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_GOLD} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_GOLD} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_MUTED }} />
              <Area
                type="monotone"
                dataKey="inbound"
                name="Inbound"
                stroke={CHART_BROWN}
                fill="url(#triadaInbound)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="ai_replies"
                name="AI replies"
                stroke={CHART_GOLD}
                fill="url(#triadaAi)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="human_handoffs"
                name="Human handoffs"
                stroke={CHART_BROWN_DARK}
                strokeWidth={1.75}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="By channel"
          summary="Conversation share across sales channels"
          className="fade-rise-delay"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channels} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="channel"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="conversations" name="Conversations" radius={[6, 6, 0, 0]}>
                {channels.map((entry) => (
                  <Cell key={entry.channel} fill={entry.color || CHART_BROWN} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Automation mix"
          summary="AI mode vs human takeover vs open queue"
          className="fade-rise-delay"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mix}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={3}
                stroke="#FAF8F4"
                strokeWidth={2}
              >
                {mix.map((entry) => (
                  <Cell key={entry.name} fill={entry.color || CHART_BROWN} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_MUTED }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="AI response time"
          summary="Histogram of first AI reply latency"
          className="fade-rise"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Replies" fill={CHART_BROWN_DARK} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Lead progression"
          summary="Contacts through qualified pipeline"
          className="fade-rise"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={funnel} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="stage"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="value"
                name="Count"
                stroke={CHART_BROWN}
                strokeWidth={2.25}
                dot={{ r: 4, fill: CHART_GOLD, stroke: CHART_BROWN_DARK, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Accessible color key */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_BROWN }} /> Brown
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_BROWN_DARK }} /> Deep brown
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_GOLD }} /> Gold
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_SAND }} /> Sand
        </span>
      </div>
    </div>
  );
}
