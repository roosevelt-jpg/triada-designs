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

const CHART_INK = "#1c1916";
const CHART_MUTED = "#6a655e";
const CHART_GRID = "#cfcfcb";
const CHART_BROWN = "#8f7354";
const CHART_BROWN_DARK = "#5e4a35";
const CHART_GOLD = "#d4b896";

const tooltipStyle = {
  background: "#FFFFFF",
  border: `1px solid ${CHART_GRID}`,
  borderRadius: 6,
  boxShadow: "0 8px 24px rgb(41 38 34 / 8%)",
  fontSize: 12,
  color: CHART_INK,
};

/** @param {{ title: string, summary?: string, children: import("react").ReactNode, className?: string }} props */
function ChartCard({ title, summary, children, className }) {
  return (
    <section className={cn("surface-card p-4 md:p-5", className)}>
      <div className="ops-card-header !mb-3 !pb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.2rem] leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h3>
          {summary ? (
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{summary}</p>
          ) : null}
        </div>
      </div>
      <div className="h-[210px] w-full sm:h-[230px]">{children}</div>
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
    <section className={cn("space-y-5", className)} aria-labelledby="ai-insights-heading">
      <div className="max-w-2xl">
        <p className="ops-section-kicker">Insights</p>
        <h2
          id="ai-insights-heading"
          className="mt-1.5 font-display text-[1.65rem] leading-tight tracking-[-0.02em] text-ink md:text-[1.85rem]"
        >
          Performance
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {insights.summary ||
            `Channel mix, volume, response time, and automation over the last ${days} days.`}
        </p>
      </div>

      <div className="ops-divider" role="presentation" />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Conversation volume"
          summary={`Inbound vs AI replies · last ${days} days`}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volume} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="triadaInbound" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_BROWN} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CHART_BROWN} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="triadaAi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_GOLD} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={CHART_GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 5" vertical={false} />
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
                strokeWidth={1.75}
              />
              <Area
                type="monotone"
                dataKey="ai_replies"
                name="AI replies"
                stroke={CHART_GOLD}
                fill="url(#triadaAi)"
                strokeWidth={1.75}
              />
              <Line
                type="monotone"
                dataKey="human_handoffs"
                name="Human handoffs"
                stroke={CHART_BROWN_DARK}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="By channel"
          summary="Conversation share across sales channels"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channels} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 5" vertical={false} />
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
              <Bar dataKey="conversations" name="Conversations" radius={[3, 3, 0, 0]}>
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
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mix}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={74}
                paddingAngle={2}
                stroke="#FFFFFF"
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
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 5" vertical={false} />
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
              <Bar dataKey="count" name="Replies" fill={CHART_BROWN_DARK} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Lead progression"
          summary="Contacts through qualified pipeline"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={funnel} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 5" vertical={false} />
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
                strokeWidth={2}
                dot={{ r: 3.5, fill: "#FFFFFF", stroke: CHART_BROWN, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
