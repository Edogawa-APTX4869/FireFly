"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Decimal from "decimal.js";
import { Building2, ChevronRight } from "lucide-react";
import { api } from "@/lib/firefly/api";
import type { Resource, Account } from "@/lib/firefly/types";
import { formatMoney } from "@/lib/utils";
import { Badge, Card, CardTitle, Skeleton } from "@/components/ui";
import { COLOR_PALETTE, ResourceIconBadge } from "@/components/resource-icon";

export interface SpendingTabProps {
  startDate: string;
  endDate: string;
  accounts: Resource<Account>[];
  primaryCode: string;
  primaryDecimals: number;
  toPrimary: (amount: string | number | Decimal, code?: string | null) => Decimal;
  selectedAccountIds: string[];
}

interface CategorySlice {
  name: string;
  value: number;
  amount: Decimal;
  percentage: number;
  dailyAvg: Decimal;
  color: string;
}

interface PayeeRow {
  name: string;
  total: Decimal;
  count: number;
  avgPerTx: Decimal;
}

function DonutTooltip({ active, payload, primaryCode }: {
  active?: boolean;
  payload?: Array<{ payload: CategorySlice }>;
  primaryCode: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="size-2.5 rounded-full inline-block" style={{ backgroundColor: slice.color }} />
        <span className="font-semibold text-fg">{slice.name}</span>
      </div>
      <div className="font-mono text-sm font-bold text-fg">
        {formatMoney(slice.amount.toString(), primaryCode)}
      </div>
      <div className="text-[11px] text-muted">
        {slice.percentage}% of total spend · {formatMoney(slice.dailyAvg.toString(), primaryCode)}/day
      </div>
    </div>
  );
}

export function SpendingTab({
  startDate,
  endDate,
  primaryCode,
  primaryDecimals,
  toPrimary,
  selectedAccountIds,
}: SpendingTabProps) {
  // Query insight expense by category
  const insightQ = useQuery({
    queryKey: ["reports", "insight-categories", startDate, endDate, selectedAccountIds.join(",")],
    queryFn: () => api.insightExpenseCategory(startDate, endDate, selectedAccountIds),
    staleTime: 60_000,
  });

  // Query uncategorized expenses
  const uncategorizedQ = useQuery({
    queryKey: ["reports", "insight-no-category", startDate, endDate, selectedAccountIds.join(",")],
    queryFn: () => api.insightExpenseNoCategory(startDate, endDate, selectedAccountIds),
    staleTime: 60_000,
  });

  // Query withdrawal transactions in period for top payees and drilldown
  const transactionsQ = useQuery({
    queryKey: ["reports", "spending-transactions", startDate, endDate],
    queryFn: () => api.transactions(1, { start: startDate, end: endDate, type: "withdrawal", limit: 100 }),
    staleTime: 60_000,
  });

  const periodDays = useMemo(() => {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [startDate, endDate]);

  // Aggregate category spending
  const spendingData = useMemo(() => {
    const map = new Map<string, Decimal>();

    // 1. Check insight endpoints
    const insightEntries = insightQ.data ?? [];
    const uncatEntries = uncategorizedQ.data ?? [];

    if (insightEntries.length > 0 || uncatEntries.length > 0) {
      for (const entry of insightEntries) {
        const catName = entry.name?.trim() || "Uncategorized";
        const amt = toPrimary(new Decimal(entry.difference_float || entry.difference || 0).abs(), entry.currency_code);
        const existing = map.get(catName) || new Decimal(0);
        map.set(catName, existing.plus(amt));
      }
      for (const entry of uncatEntries) {
        const amt = toPrimary(new Decimal(entry.difference_float || entry.difference || 0).abs(), entry.currency_code);
        const existing = map.get("Uncategorized") || new Decimal(0);
        map.set("Uncategorized", existing.plus(amt));
      }
    } else {
      // Fallback to transaction data
      const txs = transactionsQ.data?.data ?? [];
      for (const group of txs) {
        for (const split of group.attributes.transactions) {
          if (split.type !== "withdrawal") continue;
          const catName = split.category_name?.trim() || "Uncategorized";
          const amt = toPrimary(new Decimal(split.amount || 0).abs(), split.currency_code);
          const existing = map.get(catName) || new Decimal(0);
          map.set(catName, existing.plus(amt));
        }
      }
    }

    let totalSpend = new Decimal(0);
    for (const amt of map.values()) {
      totalSpend = totalSpend.plus(amt);
    }

    const categories: CategorySlice[] = [];
    let colorIdx = 0;
    for (const [name, amt] of map.entries()) {
      if (amt.isZero()) continue;
      const percentage = totalSpend.gt(0)
        ? amt.div(totalSpend).mul(100).toDecimalPlaces(1).toNumber()
        : 0;
      const dailyAvg = amt.div(periodDays).toDecimalPlaces(2);
      const color = COLOR_PALETTE[colorIdx % COLOR_PALETTE.length];
      colorIdx++;

      categories.push({
        name,
        value: amt.toNumber(),
        amount: amt,
        percentage,
        dailyAvg,
        color,
      });
    }

    // Sort descending by amount
    categories.sort((a, b) => (b.amount.gt(a.amount) ? 1 : b.amount.lt(a.amount) ? -1 : 0));

    return {
      categories,
      totalSpend,
      dailyAverage: totalSpend.div(periodDays).toDecimalPlaces(2),
    };
  }, [insightQ.data, uncategorizedQ.data, transactionsQ.data, periodDays, toPrimary]);

  // Aggregate Top Payees / Merchants
  const topPayees: PayeeRow[] = useMemo(() => {
    const txs = transactionsQ.data?.data ?? [];
    const payeeMap = new Map<string, { total: Decimal; count: number }>();

    for (const group of txs) {
      for (const split of group.attributes.transactions) {
        if (split.type !== "withdrawal") continue;
        const name = split.destination_name?.trim() || "Unknown Payee";
        const amt = toPrimary(new Decimal(split.amount || 0).abs(), split.currency_code);
        const existing = payeeMap.get(name) || { total: new Decimal(0), count: 0 };
        payeeMap.set(name, {
          total: existing.total.plus(amt),
          count: existing.count + 1,
        });
      }
    }

    const rows: PayeeRow[] = [];
    for (const [name, data] of payeeMap.entries()) {
      const avgPerTx = data.count > 0 ? data.total.div(data.count) : new Decimal(0);
      rows.push({
        name,
        total: data.total,
        count: data.count,
        avgPerTx,
      });
    }

    rows.sort((a, b) => (b.total.gt(a.total) ? 1 : b.total.lt(a.total) ? -1 : 0));
    return rows.slice(0, 10);
  }, [transactionsQ.data, toPrimary]);

  const isLoading = insightQ.isLoading && transactionsQ.isLoading;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Section: Category Donut Chart & Spending Summary */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <CardTitle>Spending by Category</CardTitle>
            <p className="text-xs text-muted">
              Where your money went over {periodDays} day{periodDays === 1 ? "" : "s"} ({startDate} – {endDate}).
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted block">Total Spent</span>
            <span className="font-mono text-lg font-bold text-danger">
              -{formatMoney(spendingData.totalSpend.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-12 items-center">
          {/* Donut Chart with Centered Total */}
          <div className="md:col-span-5 relative flex items-center justify-center">
            {isLoading ? (
              <Skeleton className="size-60 rounded-full" />
            ) : spendingData.categories.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted">No expenses in this period.</div>
            ) : (
              <div className="relative size-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<DonutTooltip primaryCode={primaryCode} />} />
                    <Pie
                      data={spendingData.categories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={105}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={800}
                    >
                      {spendingData.categories.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Label inside Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                    Total
                  </span>
                  <span className="font-mono text-base font-bold text-fg">
                    {formatMoney(spendingData.totalSpend.toFixed(0), primaryCode, 0)}
                  </span>
                  <span className="text-[10px] text-muted">
                    ~{formatMoney(spendingData.dailyAverage.toFixed(0), primaryCode, 0)}/d
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Category Legend & Mini Percentages */}
          <div className="md:col-span-7 flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Top Categories
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {spendingData.categories.slice(0, 8).map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-fg truncate">{cat.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-semibold text-fg block">
                      {formatMoney(cat.amount.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
                    </span>
                    <span className="text-[10px] text-muted">{cat.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Drill-down Category List with Daily Average Spend */}
      <Card className="flex flex-col gap-4">
        <div className="border-b border-border pb-3">
          <CardTitle>Category Drill-Down &amp; Daily Velocity</CardTitle>
          <p className="text-xs text-muted">
            Detailed breakdown of total expenditure and daily average burn per category.
          </p>
        </div>

        {spendingData.categories.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No category data recorded.</div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {spendingData.categories.map((cat) => (
              <Link
                key={cat.name}
                href={`/transactions?category=${encodeURIComponent(cat.name)}`}
                className="flex items-center justify-between py-3 px-2 rounded-xl transition-colors hover:bg-surface-2 group"
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <ResourceIconBadge
                    entityType="category"
                    entityId={cat.name}
                    defaultIcon="Store"
                    defaultColor={cat.color}
                    size="sm"
                  />
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg group-hover:text-primary transition-colors">
                        {cat.name}
                      </span>
                      <Badge tone="neutral" className="text-[10px] font-mono">
                        {cat.percentage}%
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted">
                      Daily average: {formatMoney(cat.dailyAvg.toFixed(primaryDecimals), primaryCode, primaryDecimals)}/day
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-sm font-bold text-fg">
                    {formatMoney(cat.amount.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
                  </span>
                  <ChevronRight className="size-4 text-muted group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Top Payees / Merchants Table */}
      <Card className="flex flex-col gap-4">
        <div className="border-b border-border pb-3">
          <CardTitle>Top Payees &amp; Merchants</CardTitle>
          <p className="text-xs text-muted">
            Highest expense destinations and transaction velocity.
          </p>
        </div>

        {topPayees.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No merchant records available in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="py-2 px-3 font-semibold">Rank</th>
                  <th className="py-2 px-3 font-semibold">Merchant / Payee</th>
                  <th className="py-2 px-3 text-center font-semibold">Transactions</th>
                  <th className="py-2 px-3 text-right font-semibold">Avg / Txn</th>
                  <th className="py-2 px-3 text-right font-semibold">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topPayees.map((payee, idx) => (
                  <tr key={payee.name} className="transition-colors hover:bg-surface-2/60">
                    <td className="py-2.5 px-3 font-mono text-muted">#{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-fg flex items-center gap-2">
                      <Building2 className="size-3.5 text-muted shrink-0" />
                      <span className="truncate">{payee.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-muted">{payee.count}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted">
                      {formatMoney(payee.avgPerTx.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-danger">
                      -{formatMoney(payee.total.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
