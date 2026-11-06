"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface TabItem<T extends string = string> {
  key: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

export interface AnimatedTabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[] | TabItem<T>[];
  activeTab: T;
  onChange: (key: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  tabClassName?: string;
  ariaLabel?: string;
}

export function AnimatedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  size = "md",
  className,
  tabClassName,
  ariaLabel = "Tabs",
}: AnimatedTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    ready: boolean;
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeButton = container.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`);
    if (!activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setIndicator({
      left: buttonRect.left - containerRect.left,
      top: buttonRect.top - containerRect.top,
      width: buttonRect.width,
      height: buttonRect.height,
      ready: true,
    });
  }, [activeTab]);

  useIsomorphicLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, tabs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Recalculate accurately on resize, layout shift, or font load
    const observer = new ResizeObserver(() => {
      updateIndicator();
    });
    observer.observe(container);

    window.addEventListener("resize", updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative flex flex-wrap items-center gap-1 rounded-2xl bg-surface-2 p-1",
        className,
      )}
    >
      {/* Animated Sliding Background Pill with spring easing */}
      {indicator.ready ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-0 rounded-xl bg-surface shadow-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{
            transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
            width: `${indicator.width}px`,
            height: `${indicator.height}px`,
          }}
        />
      ) : null}

      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.key}
            data-tab-key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "group relative z-10 flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.97]",
              size === "sm" && "h-8 px-2.5 text-xs",
              size === "md" && "h-9 px-3.5 text-sm",
              size === "lg" && "h-10 px-4 text-sm",
              isActive
                ? cn("text-fg font-semibold", !indicator.ready && "bg-surface shadow-xs")
                : "text-muted hover:text-fg hover:bg-surface/50",
              tabClassName,
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200",
                  isActive ? "text-primary scale-105" : "text-muted group-hover:scale-110",
                )}
                aria-hidden
              />
            )}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
