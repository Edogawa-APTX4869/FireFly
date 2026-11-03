import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Decimal from "decimal.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fmtCache = new Map<string, Intl.NumberFormat>();

/** Formats money using the currency code when Intl knows it, else symbol + number. */
export function formatMoney(
  amount: Decimal.Value | null | undefined,
  code?: string | null,
  decimals?: number | null,
  symbol?: string | null,
  opts: { signed?: boolean } = {},
): string {
  let n: number;
  try {
    n = new Decimal(amount ?? 0).toNumber();
  } catch {
    n = 0;
  }
  const hasExplicitDecimals = typeof decimals === "number";
  const key = `${code}|${hasExplicitDecimals ? decimals : "auto"}|${opts.signed}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: code ? "currency" : "decimal",
        currency: code || undefined,
        ...(hasExplicitDecimals
          ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
          : {}),
        signDisplay: opts.signed ? "exceptZero" : "auto",
      });
    } catch {
      const fallbackDec = decimals ?? 2;
      f = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: fallbackDec,
        maximumFractionDigits: fallbackDec,
        signDisplay: opts.signed ? "exceptZero" : "auto",
      });
      const plain = f;
      const sym = symbol || code || "";
      return `${sym} ${plain.format(n)}`.trim();
    }
    fmtCache.set(key, f);
  }
  return f.format(n);
}

/** Returns a zero placeholder like "0.000" for 3-decimal currencies (BHD) or "0.00" for 2-decimal currencies. */
export function zeroPlaceholder(decimals = 2): string {
  return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";
}

/** Local date as YYYY-MM-DD (not UTC, so late-evening entries don't shift a day). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthRange(offset = 0, base: Date = new Date()): { start: string; end: string; label: string } {
  const s = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const e = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  return {
    start: isoDate(s),
    end: isoDate(e),
    label: s.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
  };
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, opts);
}

/** Accepts "1,234.50", "1234,50" and similar; returns a canonical decimal string or "". */
export function parseAmount(input: string): string {
  let s = input.trim().replace(/\s/g, "");
  if (!s) return "";
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // comma is decimal separator
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  try {
    const d = new Decimal(s);
    return d.isFinite() ? d.toString() : "";
  } catch {
    return "";
  }
}

export function sumDecimal(values: Array<Decimal.Value | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, v) => {
    try {
      return acc.plus(v ?? 0);
    } catch {
      return acc;
    }
  }, new Decimal(0));
}
