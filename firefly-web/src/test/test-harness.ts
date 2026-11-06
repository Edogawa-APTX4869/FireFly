/**
 * Test Harness & Contract Reference Implementations
 * For Milestone 4 Dual-Track E2E Testing (R1, R2, R3, R4)
 */

import Decimal from "decimal.js";
import type { Account, TransactionGroup } from "@/lib/firefly/types";

// ============================================================================
// 1. Mock Browser Environment Utilities
// ============================================================================

export interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  readonly length: number;
  key: (index: number) => string | null;
}

export function createMockLocalStorage(): MockStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
}

export type MockMediaQueryListener = (e: { matches: boolean; media: string }) => void;

export interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null;
  addListener: (listener: MockMediaQueryListener) => void;
  removeListener: (listener: MockMediaQueryListener) => void;
  addEventListener: (type: string, listener: MockMediaQueryListener) => void;
  removeEventListener: (type: string, listener: MockMediaQueryListener) => void;
  dispatchEvent: (event: Event) => boolean;
  // Test helper to trigger change
  simulateChange: (matches: boolean) => void;
}

export function createMockMatchMedia(initialDark: boolean = false): {
  matchMedia: (query: string) => MockMediaQueryList;
  setDark: (dark: boolean) => void;
} {
  let isDark = initialDark;
  const listeners = new Set<MockMediaQueryListener>();

  const matchMedia = (query: string): MockMediaQueryList => {
    return {
      get matches() {
        if (query.includes("prefers-color-scheme: dark")) return isDark;
        if (query.includes("prefers-color-scheme: light")) return !isDark;
        return false;
      },
      media: query,
      onchange: null,
      addListener(listener: MockMediaQueryListener) {
        listeners.add(listener);
      },
      removeListener(listener: MockMediaQueryListener) {
        listeners.delete(listener);
      },
      addEventListener(type: string, listener: MockMediaQueryListener) {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener(type: string, listener: MockMediaQueryListener) {
        if (type === "change") listeners.delete(listener);
      },
      dispatchEvent(event: Event) {
        void event;
        listeners.forEach((l) => l({ matches: isDark, media: query }));
        return true;
      },
      simulateChange(newDark: boolean) {
        isDark = newDark;
        listeners.forEach((l) => l({ matches: newDark, media: query }));
      },
    };
  };

  const setDark = (dark: boolean) => {
    isDark = dark;
    listeners.forEach((l) =>
      l({
        matches: dark,
        media: "(prefers-color-scheme: dark)",
      }),
    );
  };

  return { matchMedia, setDark };
}

// ============================================================================
// 2. R1: Account Creation & Normalization Specification Contract
// ============================================================================

export type CreatableAccountType = "asset" | "liability" | "expense" | "revenue";

export function normalizeAccountType(type?: string): CreatableAccountType {
  if (!type) return "asset";
  const lower = type.toLowerCase().trim();
  if (
    lower === "liabilities" ||
    lower === "liability" ||
    lower === "loan" ||
    lower === "debt" ||
    lower === "mortgage"
  ) {
    return "liability";
  }
  if (lower === "expense" || lower === "expenses") return "expense";
  if (lower === "revenue" || lower === "revenues" || lower === "income") return "revenue";
  return "asset";
}

export interface CreateAccountFormValues {
  name: string;
  type: string;
  currencyCode?: string;
  accountRole?: string;
  liabilityType?: string;
  openingBalance?: string;
  openingBalanceDate?: string;
  iban?: string;
  accountNumber?: string;
  notes?: string;
}

export interface AccountPayload {
  name: string;
  type: string;
  currency_code?: string;
  account_role?: string;
  liability_type?: string;
  opening_balance?: string;
  opening_balance_date?: string;
  iban?: string;
  account_number?: string;
  notes?: string;
}

export function buildAccountPayload(values: CreateAccountFormValues, fallbackDate: string): AccountPayload {
  const normType = normalizeAccountType(values.type);
  const name = values.name.trim();
  if (!name) {
    throw new Error("Account name is required");
  }

  const payload: AccountPayload = {
    name,
    type: normType,
  };

  if (values.currencyCode?.trim()) {
    payload.currency_code = values.currencyCode.trim();
  }
  if (values.notes?.trim()) {
    payload.notes = values.notes.trim();
  }
  if (values.iban?.trim()) {
    payload.iban = values.iban.trim();
  }
  if (values.accountNumber?.trim()) {
    payload.account_number = values.accountNumber.trim();
  }

  if (normType === "asset") {
    payload.account_role = values.accountRole?.trim() || "defaultAsset";
    if (values.openingBalance?.trim()) {
      payload.opening_balance = values.openingBalance.trim();
      payload.opening_balance_date = values.openingBalanceDate?.trim() || fallbackDate;
    }
  } else if (normType === "liability") {
    payload.liability_type = values.liabilityType?.trim() || "loan";
    if (values.openingBalance?.trim()) {
      payload.opening_balance = values.openingBalance.trim();
      payload.opening_balance_date = values.openingBalanceDate?.trim() || fallbackDate;
    }
  }

  return payload;
}

// ============================================================================
// 3. R2: 30-Day KPI Calculations with Decimal.js Specification Contract
// ============================================================================

export interface KpiResult {
  inflow: Decimal;
  outflow: Decimal;
  netChange: Decimal;
  transactionCount: number;
}

export interface AccountMetadataDisplay {
  iban: string;
  role: string;
  openingBalanceDate: string;
  currency: string;
  notes: string;
}

export function compute30DayKpis(params: {
  accountId: string;
  groups: TransactionGroup[];
  referenceDate: string; // ISO date YYYY-MM-DD
}): KpiResult {
  const { accountId, groups, referenceDate } = params;
  const refStart = new Date(referenceDate + "T00:00:00.000Z");
  const refEnd = new Date(referenceDate + "T23:59:59.999Z");
  // 30 days prior (start of day)
  const cutoff = new Date(refStart.getTime() - 30 * 24 * 60 * 60 * 1000);

  let inflow = new Decimal(0);
  let outflow = new Decimal(0);
  let transactionCount = 0;

  for (const group of groups) {
    let groupCounted = false;

    for (const split of group.transactions) {
      const splitDate = new Date(split.date);
      // Check if within 30-day window [cutoff, refEnd]
      if (splitDate < cutoff || splitDate > refEnd) {
        continue;
      }

      const amountDec = new Decimal(split.amount || "0").abs();
      const isDestination = split.destination_id === accountId;
      const isSource = split.source_id === accountId;

      if (!isDestination && !isSource) {
        continue;
      }

      if (!groupCounted) {
        transactionCount++;
        groupCounted = true;
      }

      // Inflow types
      if (split.type === "deposit" && isDestination) {
        inflow = inflow.plus(amountDec);
      } else if (split.type === "transfer" && isDestination) {
        inflow = inflow.plus(amountDec);
      } else if (split.type === "opening balance" && isDestination) {
        inflow = inflow.plus(amountDec);
      }
      // Outflow types
      else if (split.type === "withdrawal" && isSource) {
        outflow = outflow.plus(amountDec);
      } else if (split.type === "transfer" && isSource) {
        outflow = outflow.plus(amountDec);
      }
    }
  }

  const netChange = inflow.minus(outflow);

  return {
    inflow,
    outflow,
    netChange,
    transactionCount,
  };
}

export function formatAccountMetadata(account?: Partial<Account>): AccountMetadataDisplay {
  return {
    iban: account?.iban?.trim() || "—",
    role: account?.account_role?.trim() || (account?.type ? String(account.type) : "—"),
    openingBalanceDate: account?.current_balance_date || "—",
    currency: account?.currency_code || account?.currency_symbol || "—",
    notes: account?.notes?.trim() || "No notes recorded",
  };
}

// ============================================================================
// 4. R3: Theme Management Specification Contract
// ============================================================================

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeManagerOptions {
  storage: MockStorage;
  matchMedia: (query: string) => MockMediaQueryList;
  onThemeChange?: (theme: Theme, resolved: ResolvedTheme) => void;
}

export class ThemeManager {
  private theme: Theme = "system";
  private resolvedTheme: ResolvedTheme = "light";
  private storage: MockStorage;
  private matchMediaQuery: MockMediaQueryList;
  private onThemeChange?: (theme: Theme, resolved: ResolvedTheme) => void;
  private cleanupListener?: () => void;

  constructor(options: ThemeManagerOptions) {
    this.storage = options.storage;
    this.onThemeChange = options.onThemeChange;
    this.matchMediaQuery = options.matchMedia("(prefers-color-scheme: dark)");

    // Initialize from storage or default to system
    const saved = this.storage.getItem("color-scheme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      this.theme = saved;
    } else {
      this.theme = "system";
    }

    this.resolve();
    this.bindMediaListener();
  }

  private resolve() {
    if (this.theme === "system") {
      this.resolvedTheme = this.matchMediaQuery.matches ? "dark" : "light";
    } else {
      this.resolvedTheme = this.theme;
    }
    this.onThemeChange?.(this.theme, this.resolvedTheme);
  }

  private bindMediaListener() {
    const handler = (e: { matches: boolean }) => {
      if (this.theme === "system") {
        this.resolvedTheme = e.matches ? "dark" : "light";
        this.onThemeChange?.(this.theme, this.resolvedTheme);
      }
    };
    this.matchMediaQuery.addEventListener("change", handler);
    this.cleanupListener = () => {
      this.matchMediaQuery.removeEventListener("change", handler);
    };
  }

  public getTheme(): Theme {
    return this.theme;
  }

  public getResolvedTheme(): ResolvedTheme {
    return this.resolvedTheme;
  }

  public setTheme(newTheme: Theme) {
    this.theme = newTheme;
    this.storage.setItem("color-scheme", newTheme);
    this.resolve();
  }

  public cycleTheme() {
    // Cycle: system -> light -> dark -> system
    if (this.theme === "system") {
      this.setTheme("light");
    } else if (this.theme === "light") {
      this.setTheme("dark");
    } else {
      this.setTheme("system");
    }
  }

  public destroy() {
    this.cleanupListener?.();
  }
}

// ============================================================================
// 5. R4: Universal Escape Stack Specification Contract
// ============================================================================

export interface Dismissible {
  id: string;
  onDismiss: () => void;
}

export class EscapeStackManager {
  private stack: Dismissible[] = [];

  public register(id: string, onDismiss: () => void): () => void {
    const item: Dismissible = { id, onDismiss };
    this.stack.push(item);
    return () => {
      this.unregister(id);
    };
  }

  public unregister(id: string) {
    this.stack = this.stack.filter((item) => item.id !== id);
  }

  public handleKeyDown(key: string): boolean {
    if (key !== "Escape" || this.stack.length === 0) {
      return false;
    }
    // LIFO: pop the topmost overlay
    const top = this.stack.pop();
    if (top) {
      top.onDismiss();
      return true;
    }
    return false;
  }

  public getStackSize(): number {
    return this.stack.length;
  }

  public getTopId(): string | undefined {
    return this.stack[this.stack.length - 1]?.id;
  }

  public clear() {
    this.stack = [];
  }
}

// ============================================================================
// 6. R4: Usability & Accessibility Specification Contract Helpers
// ============================================================================

export interface TouchTargetDimensions {
  width: number;
  height: number;
}

export function meetsTouchTargetMinimum(dimensions: TouchTargetDimensions): boolean {
  return dimensions.width >= 48 && dimensions.height >= 48;
}

export function parseCssPxDimension(styleValue: string): number {
  const match = styleValue.match(/^([\d.]+)px$/);
  if (!match) return 0;
  return parseFloat(match[1]);
}

export interface SafeAreaCheck {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export function hasSafeAreaInsets(cssText: string): SafeAreaCheck {
  return {
    top: cssText.includes("env(safe-area-inset-top)"),
    bottom: cssText.includes("env(safe-area-inset-bottom)"),
    left: cssText.includes("env(safe-area-inset-left)"),
    right: cssText.includes("env(safe-area-inset-right)"),
  };
}

