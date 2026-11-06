"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Copy, Landmark, Plus, Wand2 } from "lucide-react";
import type { TransactionTemplateRow } from "@/lib/server/db";
import { ICON_CATALOG } from "@/components/resource-icon";
import { useAiAssistantConfig } from "@/components/magic-chatbar";
import { cn } from "@/lib/utils";
import { useEscapeDismiss } from "@/lib/use-escape-dismiss";

/**
 * Floating Speed-Dial ("+" button in bottom-right):
 * Tapping "+" expands floating action pills for saved Templates, Transfer, Magic AI Assistant,
 * Income, and Expense. Automatically hides on `/new` so it never blocks form submit buttons.
 */
export function SpeedDialFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const aiConfigQ = useAiAssistantConfig();
  const aiReady = Boolean(aiConfigQ.data?.enabled && aiConfigQ.data?.verified);

  const templatesQ = useQuery({
    queryKey: ["companion-templates"],
    queryFn: async () => {
      const res = await fetch("/api/companion/templates");
      if (!res.ok) return [] as TransactionTemplateRow[];
      const json = (await res.json()) as { data?: TransactionTemplateRow[] };
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  useEscapeDismiss(open, () => setOpen(false), "speed-dial-fab");

  if (pathname === "/new") return null;

  const templates = (templatesQ.data ?? []).slice(0, 6);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="fixed right-3.5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2 md:right-8 md:bottom-8">
        {open && (
          <div className="flex flex-col items-end gap-2 fade-in">
            {templates.map((t) => {
              const IconComp = ICON_CATALOG[t.icon] ?? Copy;
              return (
                <Link
                  key={t.id}
                  href={`/new?type=${t.type}&template=${encodeURIComponent(t.id)}`}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: t.color || "var(--primary)" }}
                  >
                    <IconComp className="size-3.5" aria-hidden />
                  </span>
                  <span>Template: {t.name}</span>
                </Link>
              );
            })}

            {aiReady && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("ff:open-magic-chat"));
                }}
                className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Wand2 className="size-3.5" aria-hidden />
                </span>
                <span>AI Magic Chatbar</span>
              </button>
            )}

            <Link
              href="/accounts?create=1"
              onClick={(e) => {
                setOpen(false);
                if (pathname === "/accounts") {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("ff:open-create-account"));
                }
              }}
              className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Landmark className="size-3.5" aria-hidden />
              </span>
              <span>New account</span>
            </Link>

            <Link
              href="/new?type=transfer"
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
                <ArrowLeftRight className="size-3.5" aria-hidden />
              </span>
              <span>Transfer</span>
            </Link>

            <Link
              href="/new?type=deposit"
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
                <ArrowDownLeft className="size-3.5" aria-hidden />
              </span>
              <span>New income</span>
            </Link>

            <Link
              href="/new?type=withdrawal"
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-md transition-colors hover:bg-surface-2"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-danger-soft text-danger">
                <ArrowUpRight className="size-3.5" aria-hidden />
              </span>
              <span>New expense</span>
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close quick actions" : "Add transaction or use template"}
          aria-expanded={open}
          className={cn(
            "flex size-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 active:scale-95",
            open ? "bg-fg text-bg" : "bg-primary text-primary-fg hover:opacity-90 hover:scale-105",
          )}
        >
          <Plus
            className={cn(
              "size-7 transition-transform duration-250 ease-out",
              open && "rotate-45",
            )}
            style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            aria-hidden
          />
        </button>
      </div>
    </>
  );
}
