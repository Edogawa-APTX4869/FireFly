"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Decimal from "decimal.js";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { api } from "@/lib/firefly/api";
import type { ChartDataSet, Resource, Account } from "@/lib/firefly/types";
import { formatMoney } from "@/lib/utils";
import { Badge, Card, CardTitle, Skeleton } from "@/components/ui";
import { inferAccountDefaultStyle, ResourceIconBadge } from "@/components/resource-icon";
import { computeBalanceTrend } from "./reports-math";

function normaliseChartEntries(ds: ChartDataSet): Array<{ date: string; value: number }> {
  const entries = ds.entries;
  if (!entries) return [];
  if (Array.isArray(entries)) {
    return entries.map((e, i) => ({
      date: (e.date || e.key || String(i)).slice(0, 10),
      value: Number(e.value) || 0,
    }));
  }
  return Object.entries(entries).map(([k, v]) => ({
    date: k.slice(0, 10),
    value: Number(v) || 0,
  }));
}

interface BalanceTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  primaryCode: string;
}

function BalanceTooltip({ active, payload, label, primaryCode }: BalanceTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-muted mb-1">{label}</div>
      <div className="font-semibold text-fg">
        {formatMoney(val, primaryCode)}
      </div>
    </div>
  );
}

export interface BalanceTabProps {
  startDate: string;
  endDate: string;
  priorPeriod: { startDate: string; endDate: string };
  accounts: Resource<Account>[];
  primaryCode: string;
  primaryDecimals: number;
  toPrimary: (amount: string | number | Decimal, code?: string | null) => Decimal;
}

export function BalanceTab({
  startDate,
  endDate,
  priorPeriod,
  accounts,
  primaryCode,
  primaryDecimals,
  toPrimary,
}: BalanceTabProps) {
  // Query chart datasets for current period
  const currentChartQ = useQuery({
    queryKey: ["reports", "balance-chart", startDate, endDate],
    queryFn: () => api.accountChart(startDate, endDate),
    staleTime: 60_000,
  });

  // Query chart datasets for prior comparison period
  const priorChartQ = useQuery({
    queryKey: ["reports", "balance-chart", priorPeriod.startDate, priorPeriod.endDate],
    queryFn: () => api.accountChart(priorPeriod.startDate, priorPeriod.endDate),
    staleTime: 60_000,
  });

  const accountNamesSet = useMemo(
    () => new Set(accounts.map((a) => a.attributes.name.toLowerCase())),
    [accounts],
  );

  // Current balance by account and total portfolio balance
  const accountBreakdown = useMemo(() => {
    const rows = accounts.map((acc, idx) => {
      const nativeBalance = new Decimal(acc.attributes.current_balance || 0);
      const primaryBalance = toPrimary(nativeBalance, acc.attributes.currency_code);
      const style = inferAccountDefaultStyle(acc.attributes, idx);
      return {
        id: acc.id,
        name: acc.attributes.name,
        currencyCode: acc.attributes.currency_code || primaryCode,
        currencySymbol: acc.attributes.currency_symbol || "",
        decimals: acc.attributes.currency_decimal_places ?? 2,
        nativeBalance,
        primaryBalance,
        color: style.color,
        icon: style.icon,
      };
    });

    const portfolioTotal = rows.reduce(
      (acc, r) => (r.primaryBalance.gt(0) ? acc.plus(r.primaryBalance) : acc),
      new Decimal(0),
    );

    // Add portfolio share %
    const items = rows.map((r) => {
      const sharePct =
        portfolioTotal.gt(0) && r.primaryBalance.gt(0)
          ? r.primaryBalance.div(portfolioTotal).mul(100).toDecimalPlaces(1).toNumber()
          : 0;
      return { ...r, sharePct };
    });

    // Sort descending by primary balance
    items.sort((a, b) => (b.primaryBalance.gt(a.primaryBalance) ? 1 : b.primaryBalance.lt(a.primaryBalance) ? -1 : 0));

    return {
      portfolioTotal,
      items,
    };
  }, [accounts, primaryCode, toPrimary]);

  // Transform current period chart datasets into timeline points
  const chartPoints = useMemo(() => {
    const sets = currentChartQ.data ?? [];
    const filteredSets = sets.filter((s) => accountNamesSet.has((s.label || "").toLowerCase()));
    const effectiveSets = filteredSets.length > 0 ? filteredSets : sets;

    const byDate = new Map<string, number>();
    for (const ds of effectiveSets) {
      for (const pt of normaliseChartEntries(ds)) {
        byDate.set(pt.date, (byDate.get(pt.date) ?? 0) + pt.value);
      }
    }

    const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([fullDate, balance]) => ({
      fullDate,
      displayDate: fullDate.slice(5),
      balance: Math.round(balance * 100) / 100,
    }));
  }, [currentChartQ.data, accountNamesSet]);

  // Prior period chart timeline points for delta computation
  const priorChartPoints = useMemo(() => {
    const sets = priorChartQ.data ?? [];
    const filteredSets = sets.filter((s) => accountNamesSet.has((s.label || "").toLowerCase()));
    const effectiveSets = filteredSets.length > 0 ? filteredSets : sets;

    const byDate = new Map<string, number>();
    for (const ds of effectiveSets) {
      for (const pt of normaliseChartEntries(ds)) {
        byDate.set(pt.date, (byDate.get(pt.date) ?? 0) + pt.value);
      }
    }

    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [priorChartQ.data, accountNamesSet]);

  // Trend calculation vs past period
  const trendResult = useMemo(() => {
    // Current total: last point in chart or portfolioTotal
    const currentTotal =
      chartPoints.length > 0
        ? chartPoints[chartPoints.length - 1].balance
        : accountBreakdown.portfolioTotal;

    // Previous total: last point in prior period chart, or first point in current period
    let previousTotal: Decimal | number = 0;
    if (priorChartPoints.length > 0) {
      previousTotal = priorChartPoints[priorChartPoints.length - 1][1];
    } else if (chartPoints.length > 0) {
      previousTotal = chartPoints[0].balance;
    }

    return computeBalanceTrend({ currentTotal, previousTotal });
  }, [chartPoints, priorChartPoints, accountBreakdown.portfolioTotal]);

  const isLoading = currentChartQ.isLoading || priorChartQ.isLoading;

  return (
    <div className="flex flex-col gap-5">
      {/* Balance Trend Card ('Do I have more money than before?') */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <CardTitle>Balance Trend &amp; Net Worth</CardTitle>
            <p className="text-xs text-muted">
              Do I have more money than before? Trajectory across active accounts.
            </p>
          </div>

          {/* Past-period comparison metric */}
          <div className="flex items-center gap-2">
            <Badge
              tone={
                trendResult.trend === "up"
                  ? "success"
                  : trendResult.trend === "down"
                    ? "danger"
                    : "neutral"
              }
              className="text-xs font-semibold px-2.5 py-1"
            >
              {trendResult.trend === "up" && <TrendingUp className="size-3.5" />}
              {trendResult.trend === "down" && <TrendingDown className="size-3.5" />}
              {trendResult.trend === "flat" && <Minus className="size-3.5" />}
              <span>
                {trendResult.percentageChange >= 0 ? "+" : ""}
                {trendResult.percentageChange}% vs past period
              </span>
            </Badge>

            <span className="text-xs font-mono tabular text-muted">
              ({trendResult.difference.gte(0) ? "+" : ""}
              {formatMoney(trendResult.difference.toString(), primaryCode, primaryDecimals)})
            </span>
          </div>
        </div>

        {/* Headline Portfolio Balance */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-fg">
            {formatMoney(
              accountBreakdown.portfolioTotal.toFixed(primaryDecimals),
              primaryCode,
              primaryDecimals,
            )}
          </span>
          <span className="text-xs text-muted">total asset balance</span>
        </div>

        {/* Recharts spline Area Chart with smooth gradient fill and crosshair tooltip */}
        <div className="h-72 w-full">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : chartPoints.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No balance trend data available for this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => formatMoney(val, primaryCode, 0)}
                />
                <Tooltip
                  content={<BalanceTooltip primaryCode={primaryCode} />}
                  cursor={{ stroke: "var(--primary)", strokeWidth: 1.5, strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#balanceTrendGrad)"
                  isAnimationActive
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Balance by Accounts Proportional Bars Card */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <CardTitle>Balance by Accounts</CardTitle>
            <p className="text-xs text-muted">
              Proportional distribution across {accounts.length} asset account
              {accounts.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted block">Portfolio</span>
            <span className="font-mono text-sm font-bold text-fg">
              {formatMoney(
                accountBreakdown.portfolioTotal.toFixed(primaryDecimals),
                primaryCode,
                primaryDecimals,
              )}
            </span>
          </div>
        </div>

        {accountBreakdown.items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No active asset accounts found in current filter.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {accountBreakdown.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-surface-2/40 p-3 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ResourceIconBadge
                      entityType="account"
                      entityId={item.id}
                      defaultIcon={item.icon}
                      defaultColor={item.color}
                      size="sm"
                    />
                    <div className="truncate">
                      <span className="text-sm font-semibold text-fg block truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-muted">
                        {item.currencyCode}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-fg">
                      {formatMoney(
                        item.nativeBalance.toFixed(item.decimals),
                        item.currencyCode,
                        item.decimals,
                        item.currencySymbol,
                      )}
                    </div>
                    {item.currencyCode !== primaryCode && (
                      <div className="font-mono text-[11px] text-muted">
                        ≈ {formatMoney(item.primaryBalance.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Proportional Colored Progress Bar */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2 border border-border/40">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.max(0, Math.min(100, item.sharePct))}%`,
                        backgroundColor: item.color || "var(--primary)",
                      }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-xs font-semibold text-muted">
                    {item.sharePct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
