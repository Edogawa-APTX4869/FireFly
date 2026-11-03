"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/firefly/api";
import { resolveRate, type ResolvedRate } from "@/lib/fx/resolve";
import type { Account, Resource } from "@/lib/firefly/types";

export const qk = {
  accounts: (type: string) => ["accounts", type] as const,
  primary: ["currency", "primary"] as const,
  currencies: ["currencies"] as const,
  rates: (from: string, to: string) => ["rates", from, to] as const,
  allRates: ["rates", "all"] as const,
};

export function useAccounts(type = "all") {
  return useQuery({ queryKey: qk.accounts(type), queryFn: () => api.accounts(type), staleTime: 30_000 });
}

export function usePrimaryCurrency() {
  return useQuery({ queryKey: qk.primary, queryFn: api.primaryCurrency, staleTime: 10 * 60_000 });
}

export function useCurrencies() {
  return useQuery({ queryKey: qk.currencies, queryFn: api.currencies, staleTime: 10 * 60_000 });
}

/**
 * Resolves the stored Firefly III exchange rate `from → to` for `date`.
 * Each currency pair is fetched once and cached, so swapping accounts is instant.
 */
export function useExchangeRate(from?: string | null, to?: string | null, date?: string) {
  const qc = useQueryClient();
  const primary = usePrimaryCurrency();
  const primaryCode = primary.data?.code;
  return useQuery<ResolvedRate | null>({
    queryKey: ["resolved-rate", from, to, date, primaryCode],
    enabled: !!from && !!to && !!date && !primary.isLoading,
    staleTime: 60_000,
    queryFn: () =>
      resolveRate(
        from!,
        to!,
        date!,
        (f, t) =>
          qc.fetchQuery({ queryKey: qk.rates(f, t), queryFn: () => api.exchangeRatesFor(f, t), staleTime: 60_000 }),
        primaryCode,
      ),
  });
}

export function accountCurrency(a?: Resource<Account> | null) {
  const code = a?.attributes.currency_code ?? "";
  let defaultDecimals = 2;
  if (code) {
    try {
      defaultDecimals = new Intl.NumberFormat(undefined, { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    } catch {
      defaultDecimals = 2;
    }
  }
  return {
    code,
    symbol: a?.attributes.currency_symbol ?? "",
    decimals: a?.attributes.currency_decimal_places ?? defaultDecimals,
  };
}

/** Rates (code → primary) for a set of currency codes, using stored Firefly rates. */
export function useRatesToPrimary(codes: string[], date: string) {
  const qc = useQueryClient();
  const primary = usePrimaryCurrency();
  const p = primary.data?.code;
  const unique = [...new Set(codes.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["rates-to-primary", p, unique.join(","), date],
    enabled: !!p && unique.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, ResolvedRate | null> = {};
      await Promise.all(
        unique.map(async (code) => {
          out[code] = await resolveRate(
            code,
            p!,
            date,
            (f, t) =>
              qc.fetchQuery({ queryKey: qk.rates(f, t), queryFn: () => api.exchangeRatesFor(f, t), staleTime: 60_000 }),
            p,
          );
        }),
      );
      return out;
    },
  });
}

export const ASSET_LIKE = new Set(["asset", "liability", "liabilities", "loan", "debt", "mortgage"]);
