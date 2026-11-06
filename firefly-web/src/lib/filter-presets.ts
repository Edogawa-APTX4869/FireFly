export type PeriodPreset =
  | "7D"
  | "30D"
  | "12W"
  | "6M"
  | "1Y"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

export type AccountFilterMode = "all_stats" | "all" | "custom";

export interface DateRange {
  start: string;
  end: string;
  startDate: string;
  endDate: string;
}

function toRange(start: string, end: string): DateRange {
  return { start, end, startDate: start, endDate: end };
}

export interface PresetOption {
  key: PeriodPreset;
  label: string;
  shortLabel: string;
  type: "rolling" | "calendar" | "custom";
}

export const PERIOD_PRESETS: PresetOption[] = [
  { key: "7D", label: "Last 7 days", shortLabel: "7D", type: "rolling" },
  { key: "30D", label: "Last 30 days", shortLabel: "30D", type: "rolling" },
  { key: "12W", label: "Last 12 weeks", shortLabel: "12W", type: "rolling" },
  { key: "6M", label: "Last 6 months", shortLabel: "6M", type: "rolling" },
  { key: "1Y", label: "Last 1 year", shortLabel: "1Y", type: "rolling" },
  { key: "this_month", label: "This month", shortLabel: "This month", type: "calendar" },
  { key: "last_month", label: "Last month", shortLabel: "Last month", type: "calendar" },
  { key: "this_year", label: "This year", shortLabel: "This year", type: "calendar" },
  { key: "last_year", label: "Last year", shortLabel: "Last year", type: "calendar" },
  { key: "custom", label: "Custom range", shortLabel: "Custom", type: "custom" },
];

export const VALID_PRESETS = new Set<string>(PERIOD_PRESETS.map((p) => p.key));

export function isValidPreset(val: unknown): val is PeriodPreset {
  return typeof val === "string" && VALID_PRESETS.has(val);
}

/** Formats a Date object as YYYY-MM-DD in local time. */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string into a Date at local midnight. */
export function parseDate(dateStr: string): Date {
  const clean = dateStr.slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  if (!y || isNaN(y) || isNaN(m) || isNaN(d)) {
    return new Date();
  }
  return new Date(y, m - 1, d);
}

/** Adds or subtracts days using local calendar math. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Adds or subtracts months, clamping days to month boundaries (e.g. Aug 31 - 1 month = Jul 31, Mar 31 - 1 month = Feb 28/29). */
export function addMonths(d: Date, months: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + months;
  const targetDay = d.getDate();
  const lastDayOfTarget = new Date(y, m + 1, 0).getDate();
  const clampedDay = Math.min(targetDay, lastDayOfTarget);
  return new Date(y, m, clampedDay);
}

/** Adds or subtracts years. */
export function addYears(d: Date, years: number): Date {
  return addMonths(d, years * 12);
}

/**
 * Computes the start and end dates formatted as YYYY-MM-DD for a given preset.
 * All computations use local calendar math.
 */
export function getPresetDateRange(preset: PeriodPreset, referenceDate?: Date | string): DateRange {
  let today: Date;
  if (typeof referenceDate === "string") {
    today = parseDate(referenceDate);
  } else if (referenceDate instanceof Date) {
    today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  } else {
    const ref = new Date();
    today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  }

  switch (preset) {
    case "7D": {
      // 7 calendar days inclusive: T-6 to T
      const start = addDays(today, -6);
      return toRange(formatDate(start), formatDate(today));
    }
    case "30D": {
      // 30 calendar days inclusive: T-29 to T
      const start = addDays(today, -29);
      return toRange(formatDate(start), formatDate(today));
    }
    case "12W": {
      // 12 weeks = 84 calendar days inclusive: T-83 to T
      const start = addDays(today, -83);
      return toRange(formatDate(start), formatDate(today));
    }
    case "6M": {
      // Rolling 6 months
      const start = addMonths(today, -6);
      return toRange(formatDate(start), formatDate(today));
    }
    case "1Y": {
      // Rolling 1 year
      const start = addYears(today, -1);
      return toRange(formatDate(start), formatDate(today));
    }
    case "this_month": {
      // 1st of current month to last day of current month
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return toRange(formatDate(start), formatDate(end));
    }
    case "last_month": {
      // 1st of previous month to last day of previous month
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return toRange(formatDate(start), formatDate(end));
    }
    case "this_year": {
      // Jan 1 to Dec 31 of current year
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return toRange(formatDate(start), formatDate(end));
    }
    case "last_year": {
      // Jan 1 to Dec 31 of previous year
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      return toRange(formatDate(start), formatDate(end));
    }
    case "custom":
    default: {
      const todayStr = formatDate(today);
      return toRange(todayStr, todayStr);
    }
  }
}

/** Alias for getPresetDateRange */
export const calculatePresetDateRange = getPresetDateRange;

/**
 * Steps the date range forward (+1) or backward (-1) according to the preset rules.
 */
export function stepPeriod(
  currentPreset: PeriodPreset,
  currentStart: string,
  currentEnd: string,
  direction: -1 | 1,
): DateRange;
export function stepPeriod(
  current: { preset: PeriodPreset; startDate?: string; start?: string; endDate?: string; end?: string },
  direction: -1 | 1,
): DateRange;
export function stepPeriod(
  arg1: PeriodPreset | { preset: PeriodPreset; startDate?: string; start?: string; endDate?: string; end?: string },
  arg2: string | -1 | 1,
  arg3?: string,
  arg4?: -1 | 1,
): DateRange {
  let currentPreset: PeriodPreset;
  let currentStart: string;
  let currentEnd: string;
  let direction: -1 | 1;

  if (typeof arg1 === "object" && arg1 !== null) {
    currentPreset = arg1.preset;
    currentStart = arg1.startDate || arg1.start || "";
    currentEnd = arg1.endDate || arg1.end || "";
    direction = arg2 as -1 | 1;
  } else {
    currentPreset = arg1;
    currentStart = arg2 as string;
    currentEnd = arg3 as string;
    direction = arg4 as -1 | 1;
  }

  const s = parseDate(currentStart);
  const e = parseDate(currentEnd);

  switch (currentPreset) {
    case "this_month":
    case "last_month": {
      // Step by 1 calendar month
      const newYear = s.getFullYear();
      const newMonth = s.getMonth() + direction;
      const start = new Date(newYear, newMonth, 1);
      const end = new Date(newYear, newMonth + 1, 0);
      return toRange(formatDate(start), formatDate(end));
    }
    case "this_year":
    case "last_year": {
      // Step by 1 calendar year
      const newYear = s.getFullYear() + direction;
      const start = new Date(newYear, 0, 1);
      const end = new Date(newYear, 11, 31);
      return toRange(formatDate(start), formatDate(end));
    }
    case "7D": {
      return toRange(
        formatDate(addDays(s, direction * 7)),
        formatDate(addDays(e, direction * 7)),
      );
    }
    case "30D": {
      return toRange(
        formatDate(addDays(s, direction * 30)),
        formatDate(addDays(e, direction * 30)),
      );
    }
    case "12W": {
      return toRange(
        formatDate(addDays(s, direction * 84)),
        formatDate(addDays(e, direction * 84)),
      );
    }
    case "6M": {
      return toRange(
        formatDate(addMonths(s, direction * 6)),
        formatDate(addMonths(e, direction * 6)),
      );
    }
    case "1Y": {
      return toRange(
        formatDate(addYears(s, direction)),
        formatDate(addYears(e, direction)),
      );
    }
    case "custom":
    default: {
      // Shift by the exact duration in days
      const diffTime = e.getTime() - s.getTime();
      const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
      return toRange(
        formatDate(addDays(s, direction * diffDays)),
        formatDate(addDays(e, direction * diffDays)),
      );
    }
  }
}

/**
 * Computes the prior period of identical duration immediately preceding `start`.
 * e.g., if current is [Nov 1, Nov 7] (7 days), prior is [Oct 25, Oct 31] (7 days).
 */
export function getPriorPeriod(start: string, end: string): DateRange {
  const s = parseDate(start);
  const e = parseDate(end);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
  const priorEnd = addDays(s, -1);
  const priorStart = addDays(priorEnd, -diffDays);
  return toRange(formatDate(priorStart), formatDate(priorEnd));
}

/** Alias for getPriorPeriod */
export const getPreviousPeriod = getPriorPeriod;

/** Returns a readable label for a preset and date range. */
export function getPeriodDisplayLabel(preset: PeriodPreset, start: string, end: string): string {
  const found = PERIOD_PRESETS.find((p) => p.key === preset);
  if (preset === "custom") {
    return `${start} – ${end}`;
  }
  if (found) {
    return found.label;
  }
  return `${start} – ${end}`;
}

/** Standalone account filtering helper for stats */
export function filterAccountsForStats<
  T extends {
    id?: string;
    attributes?: { include_net_worth?: boolean; active?: boolean };
    include_net_worth?: boolean;
  },
>(
  accounts: T[],
  mode: AccountFilterMode = "all_stats",
  selectedAccountIds: string[] = [],
): T[] {
  if (mode === "all") {
    return accounts;
  }
  if (mode === "custom") {
    const set = new Set(selectedAccountIds);
    return accounts.filter((a) => a.id && set.has(String(a.id)));
  }
  // 'all_stats' (default)
  return accounts.filter((a) => {
    if (a.include_net_worth === false) return false;
    if (a.attributes && a.attributes.include_net_worth === false) return false;
    return true;
  });
}

/** Serialize FilterState to URLSearchParams */
export function serializeFilterToQueryParams(state: {
  preset: PeriodPreset;
  startDate?: string;
  start?: string;
  endDate?: string;
  end?: string;
  accountFilter?: AccountFilterMode;
  accountFilterMode?: AccountFilterMode;
  selectedAccountIds?: string[];
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", state.preset);
  const s = state.startDate || state.start;
  const e = state.endDate || state.end;
  if (s) params.set("start", s);
  if (e) params.set("end", e);
  const mode = state.accountFilter || state.accountFilterMode || "all_stats";
  if (mode !== "all_stats") {
    params.set("accountFilter", mode);
    params.set("account_filter", mode);
  }
  if (state.selectedAccountIds && state.selectedAccountIds.length > 0) {
    params.set("accounts", state.selectedAccountIds.join(","));
    for (const id of state.selectedAccountIds) {
      params.append("accounts[]", id);
    }
  }
  return params;
}

/** Deserialize FilterState from URLSearchParams or record */
export function deserializeFilterFromQueryParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): {
  preset?: PeriodPreset;
  startDate?: string;
  endDate?: string;
  accountFilter?: AccountFilterMode;
  selectedAccountIds?: string[];
} {
  const getParam = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const val = params[key];
    return Array.isArray(val) ? val[0] : val ?? null;
  };

  const result: {
    preset?: PeriodPreset;
    startDate?: string;
    endDate?: string;
    accountFilter?: AccountFilterMode;
    selectedAccountIds?: string[];
  } = {};

  const period = getParam("period") || getParam("preset");
  if (period && isValidPreset(period)) result.preset = period;

  const start = getParam("start") || getParam("startDate");
  if (start) result.startDate = start;

  const end = getParam("end") || getParam("endDate");
  if (end) result.endDate = end;

  const accFilter = (getParam("accountFilter") ||
    getParam("accountFilterMode") ||
    getParam("account_filter")) as AccountFilterMode | null;
  if (accFilter === "all" || accFilter === "all_stats" || accFilter === "custom") {
    result.accountFilter = accFilter;
  }

  if (params instanceof URLSearchParams) {
    const bracket = params.getAll("accounts[]");
    if (bracket.length > 0) {
      result.selectedAccountIds = bracket;
    } else {
      const comma = params.get("accounts") || params.get("selectedAccounts");
      if (comma) {
        result.selectedAccountIds = comma.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
  } else if ("accounts[]" in params && params["accounts[]"]) {
    const accs = params["accounts[]"];
    result.selectedAccountIds = Array.isArray(accs) ? accs : [accs];
  } else if ("accounts" in params && params["accounts"]) {
    const val = params["accounts"];
    if (Array.isArray(val)) {
      result.selectedAccountIds = val;
    } else {
      result.selectedAccountIds = val.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return result;
}
