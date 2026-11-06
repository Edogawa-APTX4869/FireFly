"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Decimal from "decimal.js";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Compass,
  Repeat,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/firefly/api";
import type { Resource, Account } from "@/lib/firefly/types";
import { formatMoney, isoDate } from "@/lib/utils";
import { Badge, Card, CardTitle, Skeleton } from "@/components/ui";
import {
  project30DayCashOutlook,
  type RecurrenceConfig,
  type UnpaidBillConfig,
} from "./reports-math";

export interface OutlookTabProps {
  accounts: Resource<Account>[];
  primaryCode: string;
  primaryDecimals: number;
  toPrimary: (amount: string | number | Decimal, code?: string | null) => Decimal;
}

interface ObligationItem {
  id: string;
  title: string;
  type: "bill" | "recurrence";
  kind: "income" | "expense";
  amount: Decimal;
  dueDate: string;
  displayDate: string;
}

function OutlookTooltip({ active, payload, label, primaryCode }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  primaryCode: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const balance = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg text-xs min-w-[130px]">
      <div className="font-medium text-muted mb-1">{label}</div>
      <div className="font-semibold text-fg">
        Projected: {formatMoney(balance, primaryCode)}
      </div>
    </div>
  );
}

export function OutlookTab({
  accounts,
  primaryCode,
  primaryDecimals,
  toPrimary,
}: OutlookTabProps) {
  const today = useMemo(() => isoDate(), []);
  const todayPlus30 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return isoDate(d);
  }, []);

  // Starting liquid balance across active asset accounts
  const startingBalance = useMemo(() => {
    let total = new Decimal(0);
    for (const acc of accounts) {
      const bal = new Decimal(acc.attributes.current_balance || 0);
      total = total.plus(toPrimary(bal, acc.attributes.currency_code));
    }
    return total;
  }, [accounts, toPrimary]);

  // Query active recurrences
  const recurrencesQ = useQuery({
    queryKey: ["reports", "outlook-recurrences"],
    queryFn: api.recurrences,
    staleTime: 60_000,
  });

  // Query bills for the upcoming 30 days
  const billsQ = useQuery({
    queryKey: ["reports", "outlook-bills", today, todayPlus30],
    queryFn: () => api.bills(today, todayPlus30),
    staleTime: 60_000,
  });

  // Map recurrences and bills into projection configurations
  const { recurrenceConfigs, unpaidBillConfigs, upcomingObligations } = useMemo(() => {
    const recList: RecurrenceConfig[] = [];
    const billList: UnpaidBillConfig[] = [];
    const obligations: ObligationItem[] = [];

    // Process recurrences
    for (const r of recurrencesQ.data ?? []) {
      if (r.attributes.active === false) continue;
      const tx = r.attributes.transactions?.[0];
      if (!tx) continue;

      const amtPrimary = toPrimary(new Decimal(tx.amount || 0).abs(), tx.currency_code);
      const isIncome = r.attributes.type === "deposit";
      const rep = r.attributes.repetitions?.[0];

      let cadence: "daily" | "weekly" | "monthly" = "monthly";
      let dayOfWeek: number | undefined;
      let dayOfMonth: number | undefined;

      if (rep?.type === "daily") {
        cadence = "daily";
      } else if (rep?.type === "weekly") {
        cadence = "weekly";
        dayOfWeek = Number(rep.moment ?? 0);
      } else {
        cadence = "monthly";
        dayOfMonth = Number(rep?.moment ?? 1);
      }

      recList.push({
        name: r.attributes.title,
        amount: amtPrimary,
        type: isIncome ? "income" : "expense",
        cadence,
        dayOfWeek,
        dayOfMonth,
      });
    }

    // Process bills
    for (const b of billsQ.data ?? []) {
      if (b.attributes.active === false) continue;
      // If bill is already paid for current period, skip
      const isPaid = (b.attributes.paid_dates?.length ?? 0) > 0;
      if (isPaid) continue;

      const rawAmount = new Decimal(b.attributes.amount_min || 0)
        .plus(b.attributes.amount_max || 0)
        .div(2);
      const amtPrimary = toPrimary(rawAmount, b.attributes.currency_code);

      const dueDate = b.attributes.next_expected_match || b.attributes.date;
      if (!dueDate) continue;

      billList.push({
        name: b.attributes.name,
        amount: amtPrimary,
        dueDate: dueDate.slice(0, 10),
      });

      obligations.push({
        id: `bill-${b.id}`,
        title: b.attributes.name,
        type: "bill",
        kind: "expense",
        amount: amtPrimary,
        dueDate: dueDate.slice(0, 10),
        displayDate: dueDate.slice(5, 10),
      });
    }

    // Also extract upcoming recurrence dates over next 30 days
    const baseDate = new Date(today + "T00:00:00Z");
    for (let d = 1; d <= 30; d++) {
      const targetDate = new Date(baseDate.getTime() + d * 24 * 60 * 60 * 1000);
      const dateStr = isoDate(targetDate);
      const dayOfWeek = targetDate.getUTCDay();
      const dayOfMonth = targetDate.getUTCDate();

      for (const rec of recList) {
        let matches = false;
        if (rec.cadence === "daily") matches = true;
        else if (rec.cadence === "weekly" && rec.dayOfWeek === dayOfWeek) matches = true;
        else if (rec.cadence === "monthly" && rec.dayOfMonth === dayOfMonth) matches = true;

        if (matches) {
          obligations.push({
            id: `rec-${rec.name}-${dateStr}`,
            title: rec.name,
            type: "recurrence",
            kind: rec.type,
            amount: new Decimal(rec.amount),
            dueDate: dateStr,
            displayDate: dateStr.slice(5, 10),
          });
        }
      }
    }

    // Sort obligations chronologically
    obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      recurrenceConfigs: recList,
      unpaidBillConfigs: billList,
      upcomingObligations: obligations,
    };
  }, [recurrencesQ.data, billsQ.data, today, toPrimary]);

  // Run 30-day projection
  const projection = useMemo(() => {
    return project30DayCashOutlook({
      startingBalance,
      startDate: today,
      recurrences: recurrenceConfigs,
      unpaidBills: unpaidBillConfigs,
    });
  }, [startingBalance, today, recurrenceConfigs, unpaidBillConfigs]);

  const chartPoints = useMemo(() => {
    return projection.dailyBalances.map((pt) => ({
      date: pt.date,
      displayDate: pt.date.slice(5),
      balance: Math.round(pt.balance.toNumber() * 100) / 100,
    }));
  }, [projection.dailyBalances]);

  // Total anticipated income vs bills
  const { totalExpectedIncome, totalExpectedBills } = useMemo(() => {
    let inc = new Decimal(0);
    let bills = new Decimal(0);
    for (const ob of upcomingObligations) {
      if (ob.kind === "income") inc = inc.plus(ob.amount);
      else bills = bills.plus(ob.amount);
    }
    return { totalExpectedIncome: inc, totalExpectedBills: bills };
  }, [upcomingObligations]);

  const isDeficitRisk = projection.minBalance.isNegative();
  const isBufferLow =
    !isDeficitRisk &&
    startingBalance.gt(0) &&
    projection.minBalance.lt(startingBalance.mul(0.2));

  const isLoading = recurrencesQ.isLoading || billsQ.isLoading;

  return (
    <div className="flex flex-col gap-5">
      {/* 30-Day Outlook KPI Summary Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Expected Minimum Balance */}
        <Card className="flex flex-col gap-1.5 p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Expected Min Balance</span>
            <AlertTriangle className="size-4 text-amber-500" />
          </div>
          <div
            className={
              isDeficitRisk
                ? "font-mono text-2xl font-bold text-danger"
                : "font-mono text-2xl font-bold text-fg"
            }
          >
            {formatMoney(
              projection.minBalance.toFixed(primaryDecimals),
              primaryCode,
              primaryDecimals,
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Clock className="size-3" />
            <span>Expected on {projection.minBalanceDate}</span>
          </div>
        </Card>

        {/* Projected 30-Day Ending Balance */}
        <Card className="flex flex-col gap-1.5 p-4 border-l-4 border-l-primary">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Projected Day 30</span>
            <Compass className="size-4 text-primary" />
          </div>
          <div className="font-mono text-2xl font-bold text-primary">
            {formatMoney(
              projection.endingBalance.toFixed(primaryDecimals),
              primaryCode,
              primaryDecimals,
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            {projection.endingBalance.gte(startingBalance) ? (
              <span className="text-success flex items-center gap-0.5">
                <TrendingUp className="size-3" />
                Net runway expanding
              </span>
            ) : (
              <span className="text-danger flex items-center gap-0.5">
                <TrendingDown className="size-3" />
                Net balance dipping
              </span>
            )}
          </div>
        </Card>

        {/* Anticipated Inflows */}
        <Card className="flex flex-col gap-1.5 p-4 border-l-4 border-l-success">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Upcoming Inflows</span>
            <TrendingUp className="size-4 text-success" />
          </div>
          <div className="font-mono text-2xl font-bold text-success">
            +{formatMoney(totalExpectedIncome.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
          </div>
          <span className="text-[11px] text-muted">Scheduled recurring deposits</span>
        </Card>

        {/* Upcoming Obligations */}
        <Card className="flex flex-col gap-1.5 p-4 border-l-4 border-l-danger">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>Upcoming Bills &amp; Outflows</span>
            <TrendingDown className="size-4 text-danger" />
          </div>
          <div className="font-mono text-2xl font-bold text-danger">
            -{formatMoney(totalExpectedBills.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
          </div>
          <span className="text-[11px] text-muted">Unpaid bills and scheduled expenses</span>
        </Card>
      </div>

      {/* Projection Area Chart Card */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <CardTitle>30-Day Forward Balance Simulation</CardTitle>
            <p className="text-xs text-muted">
              Projected trajectory from today ({today}) to {todayPlus30} factoring recurring schedules and unpaid bills.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isDeficitRisk ? (
              <Badge tone="danger" className="text-xs font-semibold px-2.5 py-1">
                <AlertTriangle className="size-3.5" />
                <span>Deficit warning on {projection.minBalanceDate}</span>
              </Badge>
            ) : isBufferLow ? (
              <Badge tone="warning" className="text-xs font-semibold px-2.5 py-1">
                <AlertTriangle className="size-3.5" />
                <span>Low buffer ({projection.minBalanceDate})</span>
              </Badge>
            ) : (
              <Badge tone="success" className="text-xs font-semibold px-2.5 py-1">
                <ShieldCheck className="size-3.5" />
                <span>Runway Healthy</span>
              </Badge>
            )}
          </div>
        </div>

        <div className="h-72 w-full">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="outlookGrad" x1="0" y1="0" x2="0" y2="1">
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
                  tickFormatter={(v) => formatMoney(v, primaryCode, 0)}
                />
                <Tooltip content={<OutlookTooltip primaryCode={primaryCode} />} />
                <ReferenceLine
                  x={projection.minBalanceDate.slice(5)}
                  stroke="var(--danger)"
                  strokeDasharray="3 3"
                  label={{ value: "Min Balance", fill: "var(--danger)", fontSize: 10, position: "top" }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  strokeDasharray="4 2"
                  fill="url(#outlookGrad)"
                  isAnimationActive
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* List of Upcoming Obligations */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <CardTitle>Upcoming Obligations (Next 30 Days)</CardTitle>
            <p className="text-xs text-muted">
              Chronological schedule of unpaid bills and recurring transaction commitments.
            </p>
          </div>
          <Badge tone="neutral" className="text-xs">
            {upcomingObligations.length} commitment{upcomingObligations.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {upcomingObligations.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No upcoming bills or recurring transactions detected in the next 30 days.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {upcomingObligations.slice(0, 20).map((ob) => (
              <div
                key={ob.id}
                className="flex items-center justify-between py-2.5 px-2 transition-colors hover:bg-surface-2 rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                    {ob.type === "bill" ? (
                      <Calendar className="size-4" />
                    ) : (
                      <Repeat className="size-4 text-primary" />
                    )}
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-semibold text-fg block truncate">
                      {ob.title}
                    </span>
                    <span className="text-[11px] text-muted">
                      Due: {ob.dueDate} · {ob.type === "bill" ? "Bill" : "Recurrence"}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={
                      ob.kind === "income"
                        ? "font-mono text-xs font-bold text-success"
                        : "font-mono text-xs font-bold text-danger"
                    }
                  >
                    {ob.kind === "income" ? "+" : "-"}
                    {formatMoney(ob.amount.toFixed(primaryDecimals), primaryCode, primaryDecimals)}
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
