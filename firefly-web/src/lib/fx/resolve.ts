import Decimal from "decimal.js";

/** A single stored exchange rate: 1 `from` = `rate` `to`, valid on `date` (YYYY-MM-DD). */
export interface StoredRate {
  from: string;
  to: string;
  rate: string;
  date: string;
}

export type RateSource = "identity" | "direct" | "inverse" | "triangulated" | "manual";

export interface ResolvedRate {
  /** 1 unit of `from` equals `rate` units of `to`. */
  rate: Decimal;
  from: string;
  to: string;
  source: RateSource;
  /** Date of the underlying stored rate(s) (oldest when triangulated). */
  date?: string;
  /** True when no rate existed on/before the requested date and a later one was used. */
  approximate: boolean;
  /** Human readable path, e.g. "USD → EUR → GBP". */
  path: string[];
}

/** Loads stored rates for a currency pair (note: Firefly's endpoint may return both directions). */
export type RateLoader = (from: string, to: string) => Promise<StoredRate[]>;

const normDate = (d: string) => d.slice(0, 10);

/**
 * Picks the most recent rate dated on or before `date`.
 * Falls back to the earliest rate after `date` (flagged approximate) when none exist before.
 */
export function pickRate(
  rates: StoredRate[],
  date: string,
): { rate: StoredRate; approximate: boolean } | null {
  const valid = rates.filter((r) => {
    try {
      return new Decimal(r.rate).gt(0);
    } catch {
      return false;
    }
  });
  if (valid.length === 0) return null;
  const target = normDate(date);
  const sorted = [...valid].sort((a, b) => normDate(a.date).localeCompare(normDate(b.date)));
  let best: StoredRate | null = null;
  for (const r of sorted) {
    if (normDate(r.date) <= target) best = r;
    else break;
  }
  if (best) return { rate: best, approximate: false };
  return { rate: sorted[0], approximate: true };
}

async function directOrInverse(
  from: string,
  to: string,
  date: string,
  load: RateLoader,
): Promise<ResolvedRate | null> {
  // Firefly III's GET /exchange-rates/{from}/{to} returns records in BOTH directions
  // ((from,to) OR (to,from)), so we must check each record's actual `from` and `to` fields!
  const rawFwd = await load(from, to);
  let directRates = rawFwd.filter((r) => r.from === from && r.to === to);
  let inverseRates = rawFwd.filter((r) => r.from === to && r.to === from);

  // If the loader is strictly directional (only returned one direction), also query (to, from).
  if (directRates.length === 0 || inverseRates.length === 0) {
    const rawRev = await load(to, from);
    if (directRates.length === 0) directRates = rawRev.filter((r) => r.from === from && r.to === to);
    if (inverseRates.length === 0) inverseRates = rawRev.filter((r) => r.from === to && r.to === from);
  }

  const direct = pickRate(directRates, date);
  const inverse = pickRate(inverseRates, date);

  // Prefer a non-approximate result; when both qualify, prefer the more recent one,
  // and on ties prefer the direct pair.
  const candidates: ResolvedRate[] = [];
  if (direct) {
    candidates.push({
      rate: new Decimal(direct.rate.rate),
      from,
      to,
      source: "direct",
      date: normDate(direct.rate.date),
      approximate: direct.approximate,
      path: [from, to],
    });
  }
  if (inverse) {
    candidates.push({
      rate: new Decimal(1).div(inverse.rate.rate),
      from,
      to,
      source: "inverse",
      date: normDate(inverse.rate.date),
      approximate: inverse.approximate,
      path: [from, to],
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.approximate !== b.approximate) return a.approximate ? 1 : -1;
    // non-approximate: newer is better; approximate: closer (earlier) is better
    const cmp = (b.date ?? "").localeCompare(a.date ?? "");
    if (cmp !== 0) return a.approximate ? -cmp : cmp;
    return a.source === "direct" ? -1 : 1;
  });
  return candidates[0];
}

/**
 * Resolves the exchange rate `from → to` for `date` using Firefly III's stored rates.
 * Order: identity → direct / inverse → triangulated via the primary currency.
 */
export async function resolveRate(
  from: string,
  to: string,
  date: string,
  load: RateLoader,
  primary?: string,
): Promise<ResolvedRate | null> {
  if (from === to) {
    return { rate: new Decimal(1), from, to, source: "identity", approximate: false, path: [from] };
  }
  const simple = await directOrInverse(from, to, date, load);
  if (simple && !simple.approximate) return simple;

  if (primary && primary !== from && primary !== to) {
    const leg1 = await directOrInverse(from, primary, date, load);
    const leg2 = leg1 ? await directOrInverse(primary, to, date, load) : null;
    if (leg1 && leg2) {
      const tri: ResolvedRate = {
        rate: leg1.rate.mul(leg2.rate),
        from,
        to,
        source: "triangulated",
        date: [leg1.date ?? "", leg2.date ?? ""].sort()[0] || undefined,
        approximate: leg1.approximate || leg2.approximate,
        path: [from, primary, to],
      };
      if (!simple || (simple.approximate && !tri.approximate)) return tri;
    }
  }
  return simple;
}

/** Converts `amount` using `rate`, rounded to `decimals` places (banker-safe half-up). */
export function convert(amount: Decimal.Value, rate: Decimal.Value, decimals = 2): string {
  return new Decimal(amount).mul(rate).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
}

/** Reverse conversion: how much `from` is needed to get `amount` of `to`. */
export function convertBack(amount: Decimal.Value, rate: Decimal.Value, decimals = 2): string {
  return new Decimal(amount).div(rate).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
}

/** Effective rate implied by two amounts (to / from), for saving manual overrides. */
export function impliedRate(fromAmount: Decimal.Value, toAmount: Decimal.Value): Decimal | null {
  const f = new Decimal(fromAmount || 0);
  if (f.lte(0)) return null;
  return new Decimal(toAmount || 0).div(f);
}

/** Formats a rate with full precision (up to 6 decimal places, trimming trailing zeros). */
export function formatRate(rate: Decimal.Value): string {
  const d = new Decimal(rate);
  if (d.gte(100)) return d.toDecimalPlaces(4).toString();
  if (d.gte(1)) return d.toDecimalPlaces(6).toString();
  return d.toSignificantDigits(6).toString();
}
