"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardCardConfig, DashboardCardKey } from "@/lib/dashboard-cards";
import { triggerNativeHaptic } from "@/components/capacitor-bridge";
import { ImpactStyle } from "@capacitor/haptics";

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
 * When currentDropIndex is provided, a hysteresis deadband is applied to prevent edge jitter/oscillation.
 */
export function computeTargetDropIndex(
  dragCenter: { x: number; y: number },
  siblingRects: SiblingRectItem[],
  currentDropIndex?: number,
): number {
  if (siblingRects.length === 0) return 0;

  // Find the sibling whose center is closest to dragCenter in 2D Euclidean space
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

  // Hysteresis deadband: when dragging interactively, require moving past midY +/- 18px
  // to prevent rapid jitter and fluttering at boundaries
  if (currentDropIndex !== undefined) {
    const HYSTERESIS = 18;

    // Detect if this sibling shares a row with another sibling (2-column layout)
    const isMultiColumn = siblingRects.some(
      (other, idx) => idx !== closestIndex && Math.abs(other.rect.top - closest.rect.top) < 60,
    );

    if (isMultiColumn) {
      // In a multi-column row, check if the pointer is horizontally aligned with the closest card
      const inClosestHorizontal =
        dragCenter.x >= closest.rect.left - 20 && dragCenter.x <= closest.rect.right + 20;

      if (inClosestHorizontal) {
        if (closestIndex === currentDropIndex) {
          if (dragCenter.y >= closestMidY + HYSTERESIS) {
            return closestIndex + 1;
          }
          return closestIndex;
        } else if (closestIndex + 1 === currentDropIndex) {
          if (dragCenter.y < closestMidY - HYSTERESIS || dragCenter.y < closestMidY) {
            return closestIndex;
          }
          return closestIndex + 1;
        }
      }
    } else {
      // Single-column layout
      if (closestIndex === currentDropIndex) {
        if (dragCenter.y >= closestMidY + HYSTERESIS) {
          return closestIndex + 1;
        }
        return closestIndex;
      } else if (closestIndex + 1 === currentDropIndex) {
        if (dragCenter.y < closestMidY - HYSTERESIS) {
          return closestIndex;
        }
        return closestIndex + 1;
      }
    }
  }

  // Standard 50% crossing (used by tests & initial entry)
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
        span === 2 ? "lg:col-span-2 2xl:col-span-2 3xl:col-span-2" : "lg:col-span-1 2xl:col-span-1 3xl:col-span-1",
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
  const frameRafRef = useRef<number | null>(null);
  const activeDragRef = useRef<ActiveDashboardDrag | null>(null);
  const activeAnimationsRef = useRef<Map<DashboardCardKey, Animation>>(new Map());
  const activeScrollSpeedRef = useRef<number>(18);
  const capturedPointerTargetRef = useRef<{ el: HTMLElement; pointerId: number } | null>(null);
  const activeScrollListenerRef = useRef<(() => void) | null>(null);
  const activeTouchMoveListenerRef = useRef<(() => void) | null>(null);
  const lastKnownScrollRef = useRef<number>(0);

  useIsomorphicLayoutEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  const pointerCoordsRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const prevRectsRef = useRef<Map<DashboardCardKey, DOMRect> | null>(null);
  const cachedSiblingRectsRef = useRef<SiblingRectItem[]>([]);

  const visibleCards = useMemo(() => cards.filter((c: DashboardCardConfig) => c.visible), [cards]);

  // Measures resting rects for all visible cards excluding the currently dragged card
  const measureSiblingRects = useCallback(
    (excludeKey: DashboardCardKey): SiblingRectItem[] => {
      if (typeof document === "undefined") return [];
      const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== excludeKey);
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
      return siblingRects;
    },
    [visibleCards],
  );

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

  // Synchronize sibling rects with scroll offset without duplicate adjustments
  const syncScrollOffset = useCallback(() => {
    const container = getScrollContainer(containerRef.current);
    if (!container || typeof window === "undefined") return;
    const currScroll =
      container === window
        ? window.scrollY
        : (container as HTMLElement)?.scrollTop || 0;
    const delta = currScroll - lastKnownScrollRef.current;
    if (Math.abs(delta) > 0.1) {
      lastKnownScrollRef.current = currScroll;
      cachedSiblingRectsRef.current = cachedSiblingRectsRef.current.map((item) => ({
        ...item,
        rect: {
          ...item.rect,
          top: item.rect.top - delta,
          bottom: item.rect.bottom - delta,
        },
      }));
    }
  }, []);

  // FLIP animation: animate sibling cards sliding smoothly when placeholder swaps slots
  // Uses Web Animations API (el.animate) to run purely on GPU compositor without style pollution
  useIsomorphicLayoutEffect(() => {
    if (!prevRectsRef.current || !activeDrag) return;
    const prevRects = prevRectsRef.current;
    prevRectsRef.current = null;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const card of visibleCards) {
      if (card.key === activeDrag.key) continue;
      const el = document.getElementById(`card-${card.key}`);
      if (!el) continue;

      // Cancel any in-flight Web Animation on this element BEFORE measuring target resting rect
      const existing = activeAnimationsRef.current.get(card.key);
      if (existing) {
        existing.cancel();
        activeAnimationsRef.current.delete(card.key);
      }

      const last = el.getBoundingClientRect();
      if (prefersReducedMotion) continue;

      const first = prevRects.get(card.key);
      if (!first) continue;

      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        if (typeof el.animate === "function") {
          const anim = el.animate(
            [
              { transform: `translate3d(${dx}px, ${dy}px, 0)` },
              { transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 220,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
              fill: "none",
            },
          );
          activeAnimationsRef.current.set(card.key, anim);
          anim.onfinish = () => {
            if (activeAnimationsRef.current.get(card.key) === anim) {
              activeAnimationsRef.current.delete(card.key);
            }
          };
        } else {
          // Fallback if el.animate is not supported
          el.style.transition = "none";
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
            el.style.transform = "translate3d(0, 0, 0)";
            setTimeout(() => {
              el.style.transform = "";
              el.style.transition = "";
            }, 230);
          });
        }
      }
    }
  }, [activeDrag?.dropIndex, activeDrag?.key, visibleCards]);

  // Hit-Testing using cached sibling rects (ZERO DOM queries or reflows during frame ticks)
  const updateDropTarget = useCallback(
    (clientX: number, clientY: number) => {
      const current = activeDragRef.current;
      if (!current) return;

      const siblingRects = cachedSiblingRectsRef.current;
      if (siblingRects.length === 0) return;

      const dragCenterX = clientX - current.pointerOffsetX + current.width * 0.5;
      const dragCenterY = clientY - current.pointerOffsetY + current.height * 0.5;

      const nextTargetIndex = computeTargetDropIndex(
        { x: dragCenterX, y: dragCenterY },
        siblingRects,
        current.dropIndex,
      );

      if (nextTargetIndex !== current.dropIndex) {
        recordSiblingRects();
        current.dropIndex = nextTargetIndex;
        triggerNativeHaptic(ImpactStyle.Light).catch(() => {});
        setActiveDrag((prev) => (prev ? { ...prev, dropIndex: nextTargetIndex } : null));
      }
    },
    [recordSiblingRects],
  );

  const runFrameTickRef = useRef<() => void>(() => {});

  // Unified vsync frame loop handling smooth auto-scrolling & hit-testing
  const runFrameTick = useCallback(() => {
    frameRafRef.current = null;
    const current = activeDragRef.current;
    if (!current || typeof window === "undefined") return;

    const { clientX, clientY } = pointerCoordsRef.current;
    const container = getScrollContainer(containerRef.current);

    let containerTop = 0;
    let containerBottom = window.innerHeight;

    if (container !== window && container instanceof HTMLElement) {
      const cRect = container.getBoundingClientRect();
      containerTop = cRect.top;
      containerBottom = cRect.bottom;
    }

    const velocity = computeAutoScrollVelocity(
      clientY,
      containerTop,
      containerBottom,
      activeScrollSpeedRef.current,
    );

    let isAutoScrolling = false;
    if (Math.abs(velocity) > 0.05) {
      isAutoScrolling = true;
      // Accelerate auto-scroll smoothly up to 30px/frame when held at the edge
      activeScrollSpeedRef.current = Math.min(30, activeScrollSpeedRef.current + 0.35);

      scrollContainerBy(container, velocity);
      syncScrollOffset();
    } else {
      activeScrollSpeedRef.current = 18;
    }

    updateDropTarget(clientX, clientY);

    if (isAutoScrolling) {
      frameRafRef.current = requestAnimationFrame(() => runFrameTickRef.current());
    }
  }, [updateDropTarget, syncScrollOffset]);

  useIsomorphicLayoutEffect(() => {
    runFrameTickRef.current = runFrameTick;
  }, [runFrameTick]);

  const scheduleFrameTick = useCallback(() => {
    if (frameRafRef.current === null) {
      frameRafRef.current = requestAnimationFrame(() => runFrameTickRef.current());
    }
  }, []);

  // Clean up drag overlay and active auto-scroll loop
  const cleanupDrag = useCallback(() => {
    if (frameRafRef.current !== null) {
      cancelAnimationFrame(frameRafRef.current);
      frameRafRef.current = null;
    }
    if (activeScrollListenerRef.current) {
      activeScrollListenerRef.current();
      activeScrollListenerRef.current = null;
    }
    if (activeTouchMoveListenerRef.current) {
      activeTouchMoveListenerRef.current();
      activeTouchMoveListenerRef.current = null;
    }
    if (capturedPointerTargetRef.current) {
      try {
        const { el, pointerId } = capturedPointerTargetRef.current;
        el.releasePointerCapture(pointerId);
      } catch {}
      capturedPointerTargetRef.current = null;
    }
    // Cancel any active Web Animations on cards
    activeAnimationsRef.current.forEach((anim) => {
      try {
        anim.cancel();
      } catch {}
    });
    activeAnimationsRef.current.clear();

    if (cloneRef.current) {
      cloneRef.current.remove();
      cloneRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.style.touchAction = "";
    }
    if (typeof document !== "undefined") {
      document.body.classList.remove("is-dashboard-dragging");
      document.documentElement.classList.remove("is-dashboard-dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.body.style.touchAction = "";
      document.documentElement.style.touchAction = "";
    }
    setActiveDrag(null);
    setIsSettling(false);
    activeScrollSpeedRef.current = 18;
  }, []);

  // Initiate drag from the ⋮⋮ grip handle icon
  const startDrag = useCallback(
    (e: React.PointerEvent, cardKey: DashboardCardKey) => {
      // Drag only on primary pointer button (left click, touch, pen)
      if (e.button !== 0 || typeof document === "undefined") return;
      if (e.cancelable) {
        e.preventDefault();
      }

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

      // Pointer capture ensures uninterrupted tracking on touch and rapid pointer movement
      const handleEl = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try {
        handleEl.setPointerCapture(pointerId);
        capturedPointerTargetRef.current = { el: handleEl, pointerId };
      } catch {}

      // Immediately lock down touch action and overscroll on body, document, and container from millisecond 0
      if (containerRef.current) {
        containerRef.current.style.touchAction = "none";
      }
      document.body.classList.add("is-dashboard-dragging");
      document.documentElement.classList.add("is-dashboard-dragging");
      document.body.style.touchAction = "none";
      document.documentElement.style.touchAction = "none";
      document.body.style.userSelect = "none";

      // Attach non-passive touchmove listener with preventDefault immediately on window and document with capture: true
      const handleTouchMove = (te: TouchEvent) => {
        if (te.cancelable) {
          te.preventDefault();
        }
      };
      window.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
      document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
      activeTouchMoveListenerRef.current = () => {
        window.removeEventListener("touchmove", handleTouchMove, true);
        document.removeEventListener("touchmove", handleTouchMove, true);
      };

      // Subtle haptic tick on touch devices & Android APK
      triggerNativeHaptic(ImpactStyle.Light).catch(() => {});
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(15);
        } catch {}
      }

      let hasExceededThreshold = false;
      let clone: HTMLElement | null = null;

      // Cache sibling resting rects at drag start
      cachedSiblingRectsRef.current = measureSiblingRects(cardKey);

      // Listen to scroll events on container/window to keep cached rects synchronized
      const container = getScrollContainer(containerRef.current);
      lastKnownScrollRef.current =
        typeof window !== "undefined"
          ? container === window
            ? window.scrollY
            : (container as HTMLElement)?.scrollTop || 0
          : 0;

      const handleContainerScroll = () => {
        syncScrollOffset();
        scheduleFrameTick();
      };

      const scrollTarget = container === window ? window : container;
      if (scrollTarget && typeof scrollTarget.addEventListener === "function") {
        scrollTarget.addEventListener("scroll", handleContainerScroll, { passive: true });
        activeScrollListenerRef.current = () => {
          scrollTarget.removeEventListener("scroll", handleContainerScroll);
        };
      }

      const isTouchOrCoarse =
        typeof window !== "undefined" &&
        (window.matchMedia("(pointer: coarse)").matches ||
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0);
      const dragScale = isTouchOrCoarse ? "1.01" : "1.02";

      const handlePointerMove = (moveEv: PointerEvent) => {
        if (moveEv.cancelable) {
          moveEv.preventDefault();
        }
        const currentX = moveEv.clientX;
        const currentY = moveEv.clientY;
        pointerCoordsRef.current = { clientX: currentX, clientY: currentY };

        if (!hasExceededThreshold) {
          const dist = Math.hypot(currentX - startX, currentY - startY);
          if (dist < 3) return;
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
          clone.style.webkitBackfaceVisibility = "hidden";
          clone.style.backfaceVisibility = "hidden";
          clone.style.contain = "paint";
          clone.classList.add("widget-card-dragging");

          document.body.appendChild(clone);
          cloneRef.current = clone;
          document.body.style.cursor = "grabbing";

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
          // Instant GPU compositor transform for 0-lag pointer tracking
          const dx = currentX - startX;
          const dy = currentY - startY;
          clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${dragScale})`;

          // Vsync RAF tick for slot hit-testing and auto-scrolling
          scheduleFrameTick();
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        window.removeEventListener("blur", handlePointerCancel);
        window.removeEventListener("keydown", handleKeyDown);
        if (activeTouchMoveListenerRef.current) {
          activeTouchMoveListenerRef.current();
          activeTouchMoveListenerRef.current = null;
        }
        handleEl.removeEventListener("lostpointercapture", handlePointerCancel);

        if (!hasExceededThreshold || !clone) {
          cleanupDrag();
          return;
        }

        if (frameRafRef.current !== null) {
          cancelAnimationFrame(frameRafRef.current);
          frameRafRef.current = null;
        }

        // Settle animation: clone lands directly onto the placeholder
        setIsSettling(true);

        const current = activeDragRef.current;
        const placeholder = document.getElementById("dashboard-drop-placeholder");
        const prefersReducedMotion =
          typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const settleDuration = prefersReducedMotion ? 0 : 200;

        const applyReorder = (dropIdx: number) => {
          const siblings = visibleCards.filter((c: DashboardCardConfig) => c.key !== cardKey);
          const newVisible = [...siblings];
          const clampedIndex = Math.max(0, Math.min(dropIdx, siblings.length));
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
        };

        if (placeholder && current && settleDuration > 0) {
          const targetRect = placeholder.getBoundingClientRect();
          const destDx = targetRect.left - current.initialLeft;
          const destDy = targetRect.top - current.initialTop;

          clone.style.transition = "transform 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms ease, opacity 180ms ease";
          clone.style.transform = `translate3d(${destDx}px, ${destDy}px, 0) scale(1.0)`;
          clone.style.boxShadow = "var(--tw-shadow, 0 1px 3px 0 rgba(0, 0, 0, 0.1))";

          setTimeout(() => {
            applyReorder(current.dropIndex);
            requestAnimationFrame(() => {
              cleanupDrag();
            });
          }, settleDuration);
        } else {
          if (current) {
            applyReorder(current.dropIndex);
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
        if (activeTouchMoveListenerRef.current) {
          activeTouchMoveListenerRef.current();
          activeTouchMoveListenerRef.current = null;
        }
        handleEl.removeEventListener("lostpointercapture", handlePointerCancel);
        cleanupDrag();
      };

      const handleKeyDown = (keyEv: KeyboardEvent) => {
        if (keyEv.key === "Escape") {
          handlePointerCancel();
        }
      };

      handleEl.addEventListener("lostpointercapture", handlePointerCancel, { once: true });
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      window.addEventListener("blur", handlePointerCancel);
      window.addEventListener("keydown", handleKeyDown);
    },
    [visibleCards, cards, onReorderCards, measureSiblingRects, scheduleFrameTick, cleanupDrag, syncScrollOffset],
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
