"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  Banknote,
  Briefcase,
  Building2,
  Bus,
  Car,
  Coffee,
  Coins,
  CreditCard,
  Dumbbell,
  Film,
  Flame,
  FolderTree,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  PawPrint,
  Phone,
  PiggyBank,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Stethoscope,
  Tags,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Account } from "@/lib/firefly/types";
import { cn } from "@/lib/utils";

export const ICON_CATALOG: Record<string, LucideIcon> = {
  Wallet,
  Landmark,
  CreditCard,
  Banknote,
  Coins,
  PiggyBank,
  TrendingUp,
  Building2,
  Store,
  ShoppingCart,
  ShoppingBag,
  Utensils,
  Coffee,
  Pizza,
  Home,
  Zap,
  Wifi,
  Phone,
  Smartphone,
  Car,
  Fuel,
  Bus,
  Plane,
  HeartPulse,
  Stethoscope,
  Dumbbell,
  GraduationCap,
  Briefcase,
  Laptop,
  Gamepad2,
  Film,
  Tv,
  Shirt,
  Gift,
  Baby,
  PawPrint,
  Wrench,
  Receipt,
  Repeat,
  Tags,
  FolderTree,
  Sparkles,
  Flame,
};

export const COLOR_PALETTE = [
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#0ea5e9", // Sky
  "#10b981", // Emerald
  "#22c55e", // Green
  "#eab308", // Yellow
  "#f97316", // Orange
  "#ef4444", // Red
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#14b8a6", // Teal
  "#64748b", // Slate
];

/**
 * Infers a smart default icon & color based on an account's category/role/name
 * when the user hasn't explicitly saved a custom icon in the database yet.
 */
export function inferAccountDefaultStyle(
  acc: Pick<Account, "name" | "type" | "account_role" | "liability_type">,
  fallbackIndex = 0,
): { icon: string; color: string } {
  const hay = `${acc.name || ""} ${acc.type || ""} ${acc.account_role || ""} ${acc.liability_type || ""}`.toLowerCase();

  if (/cash|wallet|pocket/.test(hay) || acc.account_role === "cashWalletAsset") {
    return { icon: "Wallet", color: "#a855f7" };
  }
  if (/credit|card|visa|mastercard|amex/.test(hay) || acc.account_role === "ccAsset") {
    return { icon: "CreditCard", color: "#f97316" };
  }
  if (/saving|deposit|fixed|goal|emergency|scholarship|piggy/.test(hay) || acc.account_role === "savingAsset") {
    return { icon: "PiggyBank", color: "#ec4899" };
  }
  if (/stock|eft|etf|invest|gold|crypto|portfolio|trading/.test(hay)) {
    return { icon: "TrendingUp", color: "#14b8a6" };
  }
  if (/salary|payroll|income|revenue/.test(hay)) {
    return { icon: "Briefcase", color: "#ef4444" };
  }
  if (/loan|debt|mortgage|liabilit/.test(hay)) {
    return { icon: "Receipt", color: "#eab308" };
  }
  if (acc.type === "expense") {
    return { icon: "Store", color: "#f97316" };
  }
  if (acc.type === "revenue") {
    return { icon: "Building2", color: "#10b981" };
  }
  return {
    icon: "Landmark",
    color: COLOR_PALETTE[fallbackIndex % COLOR_PALETTE.length],
  };
}

/**
 * Infers a smart default icon & color based on an expense/income category name
 * when the user hasn't customized it yet.
 */
export function inferCategoryDefaultStyle(categoryName: string, fallbackIndex = 0): { icon: string; color: string } {
  const lower = (categoryName || "").toLowerCase();
  if (/grocer|supermarket|market|lulu|carrefour/.test(lower)) return { icon: "ShoppingCart", color: "#10b981" };
  if (/restaurant|fast-food|dining|food|lunch|dinner|eat/.test(lower)) return { icon: "Utensils", color: "#f97316" };
  if (/coffee|cafe|tea|starbucks|bakery/.test(lower)) return { icon: "Coffee", color: "#eab308" };
  if (/pizza|delivery|takeout/.test(lower)) return { icon: "Pizza", color: "#ef4444" };
  if (/home|rent|housing|mortgage|apartment|property/.test(lower)) return { icon: "Home", color: "#6366f1" };
  if (/electric|water|utility|utilities|power|gas bill/.test(lower)) return { icon: "Zap", color: "#eab308" };
  if (/internet|wifi|broadband|telecom/.test(lower)) return { icon: "Wifi", color: "#0ea5e9" };
  if (/phone|mobile|sim/.test(lower)) return { icon: "Smartphone", color: "#3b82f6" };
  if (/fuel|petrol|gas|station/.test(lower)) return { icon: "Fuel", color: "#ef4444" };
  if (/car|auto|vehicle|parking|taxi|uber|maintenance/.test(lower)) return { icon: "Car", color: "#64748b" };
  if (/bus|train|metro|transit|transport/.test(lower)) return { icon: "Bus", color: "#0ea5e9" };
  if (/flight|travel|hotel|vacation|trip|airline/.test(lower)) return { icon: "Plane", color: "#14b8a6" };
  if (/health|medical|doctor|hospital|pharmacy|dental/.test(lower)) return { icon: "HeartPulse", color: "#ec4899" };
  if (/gym|fitness|sport|workout/.test(lower)) return { icon: "Dumbbell", color: "#22c55e" };
  if (/education|school|university|tuition|book|course/.test(lower)) return { icon: "GraduationCap", color: "#6366f1" };
  if (/work|business|office|salary/.test(lower)) return { icon: "Briefcase", color: "#3b82f6" };
  if (/tech|software|electronics|subscription|cloud/.test(lower)) return { icon: "Laptop", color: "#0ea5e9" };
  if (/game|gaming|entertainment|fun/.test(lower)) return { icon: "Gamepad2", color: "#a855f7" };
  if (/movie|cinema|netflix|streaming|tv/.test(lower)) return { icon: "Film", color: "#ec4899" };
  if (/cloth|fashion|apparel|shoes|laundry|حلاق|كواي/.test(lower)) return { icon: "Shirt", color: "#a855f7" };
  if (/shop|mall|amazon|store/.test(lower)) return { icon: "ShoppingBag", color: "#f97316" };
  if (/gift|charity|sadaqah|donation|zakat/.test(lower)) return { icon: "Gift", color: "#22c55e" };
  if (/baby|kid|child|family/.test(lower)) return { icon: "Baby", color: "#ec4899" };
  if (/pet|cat|dog|vet/.test(lower)) return { icon: "PawPrint", color: "#eab308" };
  if (/repair|service|tool|hardware/.test(lower)) return { icon: "Wrench", color: "#64748b" };
  return {
    icon: "FolderTree",
    color: COLOR_PALETTE[fallbackIndex % COLOR_PALETTE.length],
  };
}

export interface CompanionMetaItem {
  entity_type: string;
  entity_id: string;
  icon: string;
  color: string;
  hidden: boolean;
  is_todo: boolean;
  extra: Record<string, unknown>;
}

export function useResourceMeta() {
  const query = useQuery({
    queryKey: ["companion-meta"],
    queryFn: async () => {
      const res = await fetch("/api/companion/meta");
      if (!res.ok) return [] as CompanionMetaItem[];
      const json = (await res.json()) as { data?: CompanionMetaItem[] };
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const map = new Map<string, CompanionMetaItem>();
  for (const item of query.data ?? []) {
    map.set(`${item.entity_type}:${item.entity_id}`, item);
  }

  return {
    ...query,
    get(entityType: string, entityId: string): CompanionMetaItem | undefined {
      return map.get(`${entityType}:${entityId}`);
    },
  };
}

export function useUpdateResourceMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      entity_type: string;
      entity_id: string;
      icon?: string;
      color?: string;
      hidden?: boolean;
      is_todo?: boolean;
      extra?: Record<string, unknown>;
    }) => {
      const res = await fetch("/api/companion/meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save custom icon/meta");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companion-meta"] });
    },
  });
}

/**
 * Renders the custom icon & color badge for a Firefly III resource (Account, Category, Budget, Tag, etc.),
 * and opens an interactive Pico-style Icon & Color picker popover when clicked!
 */
export function ResourceIconBadge({
  entityType,
  entityId,
  defaultIcon = "Wallet",
  defaultColor,
  size = "md",
  editable = true,
}: {
  entityType: "account" | "category" | "budget" | "tag" | "piggy" | "template";
  entityId: string;
  defaultIcon?: string;
  defaultColor?: string;
  size?: "sm" | "md";
  editable?: boolean;
}) {
  const meta = useResourceMeta();
  const updateMut = useUpdateResourceMeta();
  const [open, setOpen] = useState(false);

  const item = meta.get(entityType, entityId);
  const iconName = item?.icon || defaultIcon;
  const color = item?.color || defaultColor || "";
  const IconComp = ICON_CATALOG[iconName] ?? Wallet;

  return (
    <div className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={!editable}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (editable) setOpen((o) => !o);
        }}
        title={editable ? "Click to customize icon & color (saved to database)" : undefined}
        style={color ? { backgroundColor: `${color}22`, color } : undefined}
        className={cn(
          "flex items-center justify-center rounded-xl transition-transform",
          size === "sm" ? "size-7" : "size-9",
          !color && "bg-primary-soft text-primary",
          editable && "hover:scale-105 cursor-pointer",
        )}
      >
        <IconComp className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      </button>

      {open && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-x-4 top-24 z-50 mx-auto max-w-xs rounded-2xl border border-border bg-surface p-3 shadow-2xl sm:absolute sm:inset-auto sm:top-full sm:left-0 sm:mt-1.5 sm:w-72"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">Choose Icon &amp; Color</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2"
            >
              Done
            </button>
          </div>

          {/* Color swatches */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateMut.mutate({ entity_type: entityType, entity_id: entityId, color: c })}
                style={{ backgroundColor: c }}
                className={cn("size-5 rounded-full border-2", color === c ? "border-fg scale-110" : "border-transparent")}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>

          {/* Icon grid */}
          <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto p-0.5">
            {Object.entries(ICON_CATALOG).map(([name, Comp]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  updateMut.mutate({ entity_type: entityType, entity_id: entityId, icon: name });
                  setOpen(false);
                }}
                title={name}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg hover:bg-surface-2",
                  iconName === name && "bg-primary-soft text-primary ring-1 ring-primary",
                )}
              >
                <Comp className="size-4" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
