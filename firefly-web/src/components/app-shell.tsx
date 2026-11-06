"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ChevronDown,
  FolderTree,
  LayoutDashboard,
  List,
  Menu,
  Moon,
  PieChart,
  Plus,
  Settings,
  Sun,
  Wallet,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SpeedDialFab } from "@/components/speed-dial-fab";
import { MagicChatbar } from "@/components/magic-chatbar";

interface NavChild {
  href: string;
  label: string;
  matchPath?: string;
  matchQuery?: Record<string, string>;
}

interface NavGroup {
  key: string;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  matchPrefixes: string[];
  children?: NavChild[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "dashboard",
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    matchPrefixes: ["/"],
  },
  {
    key: "accounts",
    href: "/accounts?tab=asset",
    label: "Accounts",
    icon: Wallet,
    matchPrefixes: ["/accounts"],
    children: [
      { href: "/accounts?tab=asset", label: "Asset accounts", matchPath: "/accounts", matchQuery: { tab: "asset" } },
      { href: "/accounts?tab=liabilities", label: "Liabilities", matchPath: "/accounts", matchQuery: { tab: "liabilities" } },
      { href: "/accounts?tab=expense", label: "Expense accounts", matchPath: "/accounts", matchQuery: { tab: "expense" } },
      { href: "/accounts?tab=revenue", label: "Revenue accounts", matchPath: "/accounts", matchQuery: { tab: "revenue" } },
    ],
  },
  {
    key: "transactions",
    href: "/transactions",
    label: "Transactions",
    icon: List,
    matchPrefixes: ["/transactions", "/new"],
    children: [
      { href: "/transactions", label: "All transactions", matchPath: "/transactions", matchQuery: { type: "" } },
      { href: "/new?type=transfer", label: "New transfer", matchPath: "/new", matchQuery: { type: "transfer" } },
      { href: "/new?type=withdrawal", label: "New expense", matchPath: "/new", matchQuery: { type: "withdrawal" } },
      { href: "/new?type=deposit", label: "New income", matchPath: "/new", matchQuery: { type: "deposit" } },
      { href: "/new?type=ramble", label: "Magic assistant (AI)", matchPath: "/new", matchQuery: { type: "ramble" } },
    ],
  },
  {
    key: "automation",
    href: "/rules?tab=rules",
    label: "Automation",
    icon: Wand2,
    matchPrefixes: ["/rules"],
    children: [
      { href: "/rules?tab=rules", label: "Automatic rules", matchPath: "/rules", matchQuery: { tab: "rules" } },
      { href: "/rules?tab=recurrences", label: "Recurring transactions", matchPath: "/rules", matchQuery: { tab: "recurrences" } },
      { href: "/rules?tab=bills", label: "Bills & subscriptions", matchPath: "/rules", matchQuery: { tab: "bills" } },
    ],
  },
  {
    key: "classification",
    href: "/categories",
    label: "Classification",
    icon: FolderTree,
    matchPrefixes: ["/categories", "/budgets", "/tags", "/piggy-banks"],
    children: [
      { href: "/categories", label: "Categories & sub", matchPath: "/categories" },
      { href: "/budgets", label: "Budgets", matchPath: "/budgets" },
      { href: "/piggy-banks", label: "Piggy banks & goals", matchPath: "/piggy-banks" },
      { href: "/tags", label: "Tags & sub-tags", matchPath: "/tags" },
    ],
  },
  {
    key: "settings",
    href: "/settings",
    label: "Configuration",
    icon: Settings,
    matchPrefixes: ["/settings"],
    children: [
      { href: "/settings#currencies", label: "Currencies & decimals", matchPath: "/settings" },
      { href: "/settings#rates", label: "Exchange rates", matchPath: "/settings" },
      { href: "/settings#system", label: "Server settings", matchPath: "/settings" },
      { href: "/settings#webhooks", label: "Webhooks", matchPath: "/settings" },
    ],
  },
];

const MOBILE_NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard, match: "/" },
  { href: "/accounts", label: "Accounts", icon: Wallet, match: "/accounts" },
  { href: "/transactions", label: "Records", icon: List, match: "/transactions" },
  { href: "/budgets", label: "Budgets", icon: PieChart, match: "/budgets" },
  { href: "/rules", label: "Auto", icon: Wand2, match: "/rules" },
];

function isGroupActive(pathname: string, group: NavGroup) {
  return group.matchPrefixes.some((prefix) => (prefix === "/" ? pathname === "/" : pathname.startsWith(prefix)));
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Manual overrides for category accordion toggles (collapsed by default unless currently active)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  function isChildActive(child: NavChild): boolean {
    if (!child.matchPath) return false;
    if (pathname !== child.matchPath) return false;
    if (!child.matchQuery) return true;
    for (const [k, expected] of Object.entries(child.matchQuery)) {
      const actual = searchParams.get(k) ?? "";
      // Default values when query param is omitted
      const normalizedActual =
        actual ||
        (pathname === "/accounts" && k === "tab"
          ? "asset"
          : pathname === "/rules" && k === "tab"
            ? "rules"
            : pathname === "/new" && k === "type"
              ? "withdrawal"
              : "");
      if (normalizedActual !== expected) return false;
    }
    return true;
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1" aria-label="Main">
      {NAV_GROUPS.map((group) => {
        const active = isGroupActive(pathname, group);
        const hasChildren = !!group.children?.length;
        const isOpen = openMap[group.key] ?? active;

        if (!hasChildren) {
          return (
            <Link
              key={group.key}
              href={group.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <group.icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{group.label}</span>
            </Link>
          );
        }

        return (
          <div key={group.key} className="flex flex-col">
            <div
              className={cn(
                "flex items-center rounded-xl transition-colors",
                active ? "bg-primary-soft/60 text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Link
                href={group.href}
                onClick={() => {
                  setOpenMap((m) => ({ ...m, [group.key]: true }));
                  onNavigate?.();
                }}
                className="flex flex-1 items-center gap-3 py-2 pl-3 pr-1 text-sm font-semibold"
              >
                <group.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{group.label}</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpenMap((m) => ({ ...m, [group.key]: !isOpen }))}
                aria-label={`Toggle ${group.label} submenu`}
                aria-expanded={isOpen}
                className="rounded-lg p-2 hover:bg-surface-2/80 transition-colors"
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform duration-200 ease-out", isOpen ? "rotate-0" : "-rotate-90")}
                  aria-hidden
                />
              </button>
            </div>

            <div className={cn("accordion-wrapper", isOpen && "is-open")}>
              <div className="overflow-hidden">
                <ul className="mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-border pl-2.5 py-0.5">
                  {group.children!.map((child) => {
                    const childActive = isChildActive(child);
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "block rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                            childActive
                              ? "bg-primary-soft font-semibold text-primary"
                              : "text-muted hover:bg-surface-2 hover:text-fg",
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, serverUrl }: { children: React.ReactNode; serverUrl: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function cycleTheme() {
    try {
      const meta = document.querySelector('meta[name="color-scheme"]');
      const cur = meta?.getAttribute("content") || "light dark";
      const next = cur === "dark" ? "light" : "dark";
      meta?.setAttribute("content", next);
      localStorage.setItem("ff-theme", next);
    } catch {
      /* ignore */
    }
  }

  // Keyboard shortcuts: N = new expense, T = transfer, I = income, / = search transactions (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "n") router.push("/new?type=withdrawal");
      if (e.key === "t") router.push("/new?type=transfer");
      if (e.key === "i") router.push("/new?type=deposit");
      if (e.key === "/") {
        e.preventDefault();
        router.push("/transactions");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-3.5 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
            <Wallet className="size-4" aria-hidden />
          </span>
          Wallet
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Toggle light or dark theme"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted hover:text-fg active:scale-95 transition-all"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open full navigation menu"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-fg active:scale-95 transition-all"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      {/* Mobile slide-over drawer with full Main + Sub menu */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-surface p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Link href="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2 text-lg font-bold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
                  <Wallet className="size-4" aria-hidden />
                </span>
                Wallet
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-2 text-muted hover:bg-surface-2 active:scale-95 transition-all"
              >
                <X className="size-5" />
              </button>
            </div>
            <Suspense fallback={<div className="flex-1" />}>
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </Suspense>
            <p className="mt-3 truncate border-t border-border pt-3 px-2 text-xs text-muted" title={serverUrl}>
              {serverUrl.replace(/^https?:\/\//, "")}
            </p>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2 px-2 text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
            <Wallet className="size-4" aria-hidden />
          </span>
          Wallet
        </Link>
        <Link
          href="/new?type=withdrawal"
          className="mb-4 flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-fg hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Plus className="size-4" aria-hidden /> New transaction
        </Link>

        <Suspense fallback={<div className="flex-1" />}>
          <SidebarNav />
        </Suspense>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 px-1">
          <p className="truncate text-xs text-muted" title={serverUrl}>
            {serverUrl.replace(/^https?:\/\//, "")}
          </p>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Toggle light or dark theme"
            title="Switch light/dark theme"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted hover:text-fg"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-3.5 pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 md:px-8 md:pt-7 md:pb-24 pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))]">
        <div className="mx-auto w-full max-w-6xl">
          {/* Desktop quick shortcut bar */}
          <div className="mb-5 hidden items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-xs text-muted md:flex">
            <span>Shortcuts:</span>
            <Link href="/new?type=withdrawal" className="inline-flex items-center gap-1 hover:text-fg">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">N</kbd> Expense
            </Link>
            <Link href="/new?type=transfer" className="inline-flex items-center gap-1 hover:text-fg">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">T</kbd> Transfer
            </Link>
            <Link href="/new?type=deposit" className="inline-flex items-center gap-1 hover:text-fg">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">I</kbd> Income
            </Link>
            <Link href="/transactions" className="inline-flex items-center gap-1 hover:text-fg">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">/</kbd> Search records
            </Link>
          </div>
          {children}
        </div>
      </main>

      {/* Fast-Access Bottom AI Magic Chatbar ("Ramble" voice & text dock) */}
      <MagicChatbar />

      {/* BudgetBakers Wallet-style Speed Dial FAB (Templates, Transfer, New Record) */}
      <SpeedDialFab />

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden select-none"
      >
        {MOBILE_NAV.map((item) => {
          const active = item.match === "/" ? pathname === "/" : pathname.startsWith(item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[50px] flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-all duration-150 active:scale-90",
                active ? "font-semibold text-primary" : "text-muted hover:text-fg",
              )}
            >
              <item.icon className={cn("size-5 transition-transform duration-200", active && "scale-110")} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
