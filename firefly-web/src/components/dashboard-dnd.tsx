"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardCardConfig, DashboardCardKey } from "@/lib/dashboard-cards";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface ActiveDashboardDrag {
  key: DashboardCardKey;
  height: number;
  width: number;
  span: number;
  dropIndex: number;
  startX: number;
  startY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  initialLeft: number;
  initialTop: number;
}

export interface SiblingRectItem {
  key: DashboardCardKey;
  rect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
}

export type DashboardRenderItem =
  | { type: "card"; card: DashboardCardConfig }
  | { type: "placeholder"; key: string; height: number; span: number };

/**
 * Calculates auto-scroll velocity based on pointer clientY and container bounds.
 * Matches State C in specification:
 * - Top zone: 80px from top of container
 * - Bottom zone: 120px from bottom (clears floating AI chat bar)
 * - Velocity curve: +/- maxScrollSpeed * (intensity ^ 1.5)
 */
export function computeAutoScrollVelocity(
  clientY: number,
  containerTop: number,
  containerBottom: number,
  maxScrollSpeed: number = 16,
): number {
  const topZone = containerTop + 80;
  const bottomZone = containerBottom - 120;

  if (clientY < topZone) {
    const intensity = Math.min(1, Math.max(0, (topZone - clientY) / 80));
    return -1 * maxScrollSpeed * Math.pow(intensity, 1.5);
  }

  if (clientY > bottomZone) {
    const intensity = Math.min(1, Math.max(0, (clientY - bottomZone) / 120));
    return maxScrollSpeed * Math.pow(intensity, 1.5);
  }

  return 0;
}

/**
 * Calculates target drop index among sibling items based on dragged card vertical center.
 * Threshold & smooth displacement: trigger a slot swap when the vertical center of the dragged card
 * crosses 50% of the height of an adjacent card.
 */
export function computeTargetDropIndex(
  dragCenter: { x: number; y: number },
  siblingRects: SiblingRectItem[],
): number {
  if (siblingRects.length === 0) return 0;

  // Find the sibling whose center is closest to dragCenter
  let closestIndex = 0;
  let minDistanceSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < siblingRects.length; i++) {
    const s = siblingRects[i];
    if (!s) continue;
    const midX = s.rect.left + s.rect.width * 0.5;
    const midY = s.rect.top + s.rect.height * 0.5;
    const distSq = Math.pow(dragCenter.x - midX, 2) + Math.pow(dragCenter.y - midY, 2);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestIndex = i;
    }
  }

  const closest = siblingRects[closestIndex];
  if (!closest) return 0;

  const closestMidY = closest.rect.top + closest.rect.height * 0.5;

  // Crossing 50% height threshold of adjacent card
  if (dragCenter.y < closestMidY) {
    return closestIndex;
  }
  return closestIndex + 1;
}

/**
 * Resolves the primary scroll container (either window or an ancestor with overflow-y).
 */
export function getScrollContainer(node: HTMLElement | null): HTMLElement | Window {
  if (typeof window === "undefined") return null as unknown as Window;
  let curr = node?.parentElement;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && curr.scrollHeight > curr.clientHeight) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return window;
}

/**
 * Scrolls the given scroll container by deltaY pixels smoothly.
 */
export function scrollContainerBy(container: HTMLElement | Window, deltaY: number) {
  if (typeof window === "undefined" || !container) return;
  if (container === window) {
    window.scrollBy({ top: deltaY, behavior: "auto" });
  } else {
    (container as HTMLElement).scrollBy({ top: deltaY, behavior: "auto" });
  }
}

/**
 * Dotted "Drop Here" Placeholder matching Section 2.B:
 * - Dynamic dimensions matching dragged widget height
 * - Dashed border, indigo tint background, rounded-2xl
 * - "Drop widget here" icon & label
 * - Subtle fade and scale-in entry animation
 */
export function DashboardDropPlaceholder({
  height,
  span,
}: {
  height: number;
  span: number;
}) {
  return (
    <div
      id="dashboard-drop-placeholder"
      data-testid="dashboard-drop-placeholder"
      data-drop-placeholder="true"
      style={{
        height: `${height}px`,
        minHeight: `${height}px`,
      }}
      className={cn(
        "widget-drop-placeholder animate-placeholder-enter w-full",
        span === 2 ? "lg:col-span-2" : "lg:col-span-1",
      )}
    >
      <div className="flex items-center gap-2 font-medium opacity-80">
        <Plus className="size-4 stroke-[2.5]" aria-hidden="true" />
        <span>Drop widget here</span>
      </div>
    </div>
  );
}

export interface UseDashboardDndOptions {
  cards: DashboardCardConfig[];
  onReorderCards: (newCards: DashboardCardConfig[]) => void;
}

export function useDashboardDnd({ cards, onReorderCards }: UseDashboardDndOptions) {
  const [activeDrag, setActiveDrag] = useState<ActiveDashboardDrag | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cloneRef = useRef<HTMLElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const activeDragRef = useRef<ActiveDashboardDrag | null>(null);

  useIsomorphicLayoutEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  const pointerCoordsRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const prevRectsRef = useRef<Map<DashboardCardKey, DOMRect> | null>(null);
  const runAutoScrollLoopRef = useRef<() => void>(() => {});

  const visibleCards = useMemo(() => cards.filter((c: DashboardCardConfig) => c.visible), [cards]);

  // Record bounding rects before React re-orders DOM for FLIP displacement
  const recordSiblingRects = useCallback(() => {
    if (typeof document === "undefined") return;
    const map = new Map<DashboardCardKey, DOMRect>();
    for (const card of visibleCards) {
      const el = document.getElementById(`card-${card.key}`);
      if (el) {
        map.set(card.key, el.getBoundingClientRect());
      }
    }
    prevRectsRef.current = map;
  }, [visibleCards]);

    // FLIP animation: animate sibling cards sliding smoothly when placeholder swaps slots
  useIsomorphicLayoutEffect(() => {
    if (!prevRectsRef.current || !activeDrag) return;
    const prevRects = prevRectsRef.current;
    prevRectsRef.current = null;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    for (const card of visibleCards) {
      if (card.key === activeDrag.key) continue;
      const el = document.getElementById(`card-${card.key}`);
      const first = prevRects.get(card.key);
      if (!el || !first) continue;

      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.style.transition = "none";
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(0.985)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 250ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease";
          el.style.transform = "translate3d(0, 0, 0) scale(0.985)";
          const onEnd = () => {
            el.style.transform = "";
            el.style.transition = "";
            el.removeEventListener("transitionend", onEnd);
          };
          el.addEventListener("transitionend", onEnd);
          setTimeout(onEnd, 260);
        });
      }
    }
  }, [activeDrag?.dropIndex, activeDrag?.key, visibleCards]);

  // Continuous Hit-Testing inside auto-scroll loop or pointermove
  const updateDropTarget = useCallback(
    (clientX: number, clientY: number) => {
      const current = activeDragRef.current;
      if (!current || typeof document === "undefined") return;

      const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== current.key);
      if (siblings.length === 0) return;

      const siblingRects: SiblingRectItem[] = [];
      for (const s of siblings) {
        const el = document.getElementById(`card-${s.key}`);
        if (el) {
          const r = el.getBoundingClientRect();
          siblingRects.push({
            key: s.key,
            rect: {
              top: r.top,
              bottom: r.bottom,
              left: r.left,
              right: r.right,
              width: r.width,
              height: r.height,
            },
          });
        }
      }

      const dragCenterX = clientX - current.pointerOffsetX + current.width * 0.5;
      const dragCenterY = clientY - current.pointerOffsetY + current.height * 0.5;

      const nextTargetIndex = computeTargetDropIndex(
        { x: dragCenterX, y: dragCenterY },
        siblingRects,
      );

      if (nextTargetIndex !== current.dropIndex) {
        recordSiblingRects();
        current.dropIndex = nextTargetIndex;
        setActiveDrag((prev) => (prev ? { ...prev, dropIndex: nextTargetIndex } : null));
      }
    },
    [visibleCards, recordSiblingRects],
  );

  // Auto-scroll loop using requestAnimationFrame with continuous hit-testing
  const runAutoScrollLoop = useCallback(() => {
    if (!activeDragRef.current || typeof window === "undefined") {
      autoScrollRafRef.current = null;
      return;
    }

    const container = getScrollContainer(containerRef.current);
    let containerTop = 0;
    let containerBottom = window.innerHeight;

    if (container !== window && container instanceof HTMLElement) {
      const cRect = container.getBoundingClientRect();
      containerTop = cRect.top;
      containerBottom = cRect.bottom;
    }

    const { clientX, clientY } = pointerCoordsRef.current;
    const velocity = computeAutoScrollVelocity(clientY, containerTop, containerBottom, 16);

    if (Math.abs(velocity) > 0.05) {
      scrollContainerBy(container, velocity);
      updateDropTarget(clientX, clientY);
      autoScrollRafRef.current = requestAnimationFrame(() => runAutoScrollLoopRef.current());
    } else {
      autoScrollRafRef.current = null;
    }
  }, [updateDropTarget]);

  useIsomorphicLayoutEffect(() => {
    runAutoScrollLoopRef.current = runAutoScrollLoop;
  }, [runAutoScrollLoop]);

  // Clean up drag overlay and active auto-scroll loop
  const cleanupDrag = useCallback(() => {
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (cloneRef.current) {
      cloneRef.current.remove();
      cloneRef.current = null;
    }
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.body.style.touchAction = "";
      // Reset any FLIP inline transforms so cards return to scale(1) cleanly
      const cardEls = document.querySelectorAll("[data-card-key]");
      cardEls.forEach((node) => {
        const el = node as HTMLElement;
        el.style.transform = "";
        el.style.transition = "";
      });
    }
    setActiveDrag(null);
    setIsSettling(false);
  }, []);

  // Initiate drag from the ⋮⋮ grip handle icon
  const startDrag = useCallback(
    (e: React.PointerEvent, cardKey: DashboardCardKey) => {
      // Drag only on primary pointer button (left click, touch, pen)
      if (e.button !== 0 || typeof document === "undefined") return;

      const cardEl = document.getElementById(`card-${cardKey}`);
      if (!cardEl) return;

      const initialRect = cardEl.getBoundingClientRect();
      const targetCard = visibleCards.find((c: DashboardCardConfig) => c.key === cardKey);
      if (!targetCard) return;

      const initialIndex = visibleCards.findIndex((c: DashboardCardConfig) => c.key === cardKey);
      const span = targetCard.span ?? 1;

      const startX = e.clientX;
      const startY = e.clientY;
      const pointerOffsetX = startX - initialRect.left;
      const pointerOffsetY = startY - initialRect.top;

      let hasExceededThreshold = false;
      let clone: HTMLElement | null = null;

      const handlePointerMove = (moveEv: PointerEvent) => {
        const currentX = moveEv.clientX;
        const currentY = moveEv.clientY;
        pointerCoordsRef.current = { clientX: currentX, clientY: currentY };

        const dist = Math.hypot(currentX - startX, currentY - startY);

        if (!hasExceededThreshold) {
          if (dist < 4) return;
          hasExceededThreshold = true;

          // Lift card into clone overlay
          clone = cardEl.cloneNode(true) as HTMLElement;
          clone.id = "dashboard-drag-clone";
          clone.removeAttribute("data-card-key");
          clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
          clone.setAttribute("aria-hidden", "true");
          clone.style.position = "fixed";
          clone.style.left = `${initialRect.left}px`;
          clone.style.top = `${initialRect.top}px`;
          clone.style.width = `${initialRect.width}px`;
          clone.style.height = `${initialRect.height}px`;
          clone.style.margin = "0";
          clone.style.zIndex = "9999";
          clone.style.pointerEvents = "none";
          clone.style.willChange = "transform";
          clone.classList.add("widget-card-dragging");

          document.body.appendChild(clone);
          cloneRef.current = clone;

          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
          document.body.style.touchAction = "none";

          setActiveDrag({
            key: cardKey,
            height: initialRect.height || 220,
            width: initialRect.width || 320,
            span,
            dropIndex: initialIndex,
            startX,
            startY,
            pointerOffsetX,
            pointerOffsetY,
            initialLeft: initialRect.left,
            initialTop: initialRect.top,
          });
        }

        if (clone) {
          moveEv.preventDefault();
          const dx = currentX - startX;
          const dy = currentY - startY;
          clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;

          updateDropTarget(currentX, currentY);

          if (!autoScrollRafRef.current) {
            autoScrollRafRef.current = requestAnimationFrame(runAutoScrollLoop);
          }
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        window.removeEventListener("blur", handlePointerCancel);
        window.removeEventListener("keydown", handleKeyDown);

        if (!hasExceededThreshold || !clone) {
          cleanupDrag();
          return;
        }

        if (autoScrollRafRef.current) {
          cancelAnimationFrame(autoScrollRafRef.current);
          autoScrollRafRef.current = null;
        }

        // Settle animation: sibling cards scale back to 1.0 while overlay lands
        setIsSettling(true);

        const current = activeDragRef.current;
        const placeholder = document.getElementById("dashboard-drop-placeholder");
        const prefersReducedMotion =
          typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const settleDuration = prefersReducedMotion ? 0 : 220;

        if (placeholder && current && settleDuration > 0) {
          const targetRect = placeholder.getBoundingClientRect();
          const destDx = targetRect.left - current.initialLeft;
          const destDy = targetRect.top - current.initialTop;

          clone.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease";
          clone.style.transform = `translate3d(${destDx}px, ${destDy}px, 0) scale(1.0)`;
          clone.style.boxShadow = "var(--tw-shadow, 0 1px 3px 0 rgba(0, 0, 0, 0.1))";

          setTimeout(() => {
            const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== cardKey);
            const newVisible = [...siblings];
            const clampedIndex = Math.max(0, Math.min(current.dropIndex, siblings.length));
            newVisible.splice(clampedIndex, 0, targetCard);

            const visibleSet = new Set(newVisible.map((c: DashboardCardConfig) => c.key));
            let vPtr = 0;
            const nextCards = cards.map((c: DashboardCardConfig) => {
              if (visibleSet.has(c.key)) {
                return newVisible[vPtr++]!;
              }
              return c;
            });

            onReorderCards(nextCards);
            cleanupDrag();
          }, settleDuration);
        } else {
          if (current) {
            const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== cardKey);
            const newVisible = [...siblings];
            const clampedIndex = Math.max(0, Math.min(current.dropIndex, siblings.length));
            newVisible.splice(clampedIndex, 0, targetCard);

            const visibleSet = new Set(newVisible.map((c: DashboardCardConfig) => c.key));
            let vPtr = 0;
            const nextCards = cards.map((c: DashboardCardConfig) => {
              if (visibleSet.has(c.key)) {
                return newVisible[vPtr++]!;
              }
              return c;
            });
            onReorderCards(nextCards);
          }
          cleanupDrag();
        }
      };

      const handlePointerCancel = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        window.removeEventListener("blur", handlePointerCancel);
        window.removeEventListener("keydown", handleKeyDown);
        cleanupDrag();
      };

      const handleKeyDown = (keyEv: KeyboardEvent) => {
        if (keyEv.key === "Escape") {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
          window.removeEventListener("pointercancel", handlePointerCancel);
          window.removeEventListener("blur", handlePointerCancel);
          window.removeEventListener("keydown", handleKeyDown);
          cleanupDrag();
        }
      };

      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      window.addEventListener("blur", handlePointerCancel);
      window.addEventListener("keydown", handleKeyDown);
    },
    [visibleCards, cards, onReorderCards, updateDropTarget, runAutoScrollLoop, cleanupDrag],
  );

  // Build items array to render in dashboard grid
  const itemsToRender: DashboardRenderItem[] = useMemo(() => {
    if (!activeDrag) {
      return visibleCards.map((card: DashboardCardConfig) => ({
        type: "card" as const,
        card,
      }));
    }

    const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== activeDrag.key);
    const result: DashboardRenderItem[] = siblings.map((card: DashboardCardConfig) => ({
      type: "card" as const,
      card,
    }));

    const clampedIndex = Math.max(0, Math.min(activeDrag.dropIndex, siblings.length));
    result.splice(clampedIndex, 0, {
      type: "placeholder",
      key: "dashboard-drop-placeholder-item",
      height: activeDrag.height,
      span: activeDrag.span,
    });

    return result;
  }, [activeDrag, visibleCards]);

  return {
    containerRef,
    activeDrag,
    isSettling,
    isDraggingAny: Boolean(activeDrag && !isSettling),
    itemsToRender,
    startDrag,
  };
}
