import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  computeAutoScrollVelocity,
  computeTargetDropIndex,
  getScrollContainer,
  DashboardDropPlaceholder,
  type SiblingRectItem,
} from "@/components/dashboard-dnd";
import type { DashboardCardKey } from "@/lib/dashboard-cards";

describe("Dashboard Drag-and-Drop Auto-Scroll Calculations", () => {
  const containerTop = 0;
  const containerBottom = 1000;
  const maxSpeed = 16;

  it("produces zero velocity in the middle dead-zone", () => {
    // Middle zone: between 80px and 880px
    expect(computeAutoScrollVelocity(100, containerTop, containerBottom, maxSpeed)).toBe(0);
    expect(computeAutoScrollVelocity(500, containerTop, containerBottom, maxSpeed)).toBe(0);
    expect(computeAutoScrollVelocity(880, containerTop, containerBottom, maxSpeed)).toBe(0);
  });

  it("scrolls upward in the top 80px zone with exponential velocity curve", () => {
    // Exact threshold boundary: 80px -> 0 speed
    expect(computeAutoScrollVelocity(80, containerTop, containerBottom, maxSpeed)).toBe(0);

    // Halfway into top zone: 40px -> intensity = 0.5, speed = -16 * (0.5 ^ 1.5) ≈ -5.657
    const midTop = computeAutoScrollVelocity(40, containerTop, containerBottom, maxSpeed);
    expect(midTop).toBeLessThan(0);
    expect(midTop).toBeCloseTo(-16 * Math.pow(0.5, 1.5), 3);

    // At the absolute top edge: 0px -> intensity = 1, speed = -16
    expect(computeAutoScrollVelocity(0, containerTop, containerBottom, maxSpeed)).toBe(-16);

    // Past top edge (pointer moved into browser chrome): clamped intensity = 1, speed = -16
    expect(computeAutoScrollVelocity(-30, containerTop, containerBottom, maxSpeed)).toBe(-16);
  });

  it("scrolls downward in the bottom 120px zone (clearing floating AI chat bar)", () => {
    // Boundary: 1000 - 120 = 880px -> 0 speed
    expect(computeAutoScrollVelocity(880, containerTop, containerBottom, maxSpeed)).toBe(0);

    // Halfway into bottom zone: 880 + 60 = 940px -> intensity = 0.5, speed = +16 * (0.5 ^ 1.5) ≈ +5.657
    const midBottom = computeAutoScrollVelocity(940, containerTop, containerBottom, maxSpeed);
    expect(midBottom).toBeGreaterThan(0);
    expect(midBottom).toBeCloseTo(16 * Math.pow(0.5, 1.5), 3);

    // At the bottom edge: 1000px -> intensity = 1, speed = +16
    expect(computeAutoScrollVelocity(1000, containerTop, containerBottom, maxSpeed)).toBe(16);

    // Below bottom edge: clamped intensity = 1, speed = +16
    expect(computeAutoScrollVelocity(1100, containerTop, containerBottom, maxSpeed)).toBe(16);
  });

  it("handles non-zero container top offsets properly (e.g. nested scroll parent)", () => {
    const customTop = 200;
    const customBottom = 800;
    // Top zone is 200 .. 280
    expect(computeAutoScrollVelocity(280, customTop, customBottom)).toBe(0);
    expect(computeAutoScrollVelocity(240, customTop, customBottom)).toBeLessThan(0);
    expect(computeAutoScrollVelocity(200, customTop, customBottom)).toBe(-16);

    // Bottom zone is 680 .. 800
    expect(computeAutoScrollVelocity(680, customTop, customBottom)).toBe(0);
    expect(computeAutoScrollVelocity(740, customTop, customBottom)).toBeGreaterThan(0);
    expect(computeAutoScrollVelocity(800, customTop, customBottom)).toBe(16);
  });
});

describe("Dashboard Target Drop Index Calculation (50% Center Crossing & 2-Col Bento)", () => {
  it("returns index 0 when there are no siblings", () => {
    expect(computeTargetDropIndex({ x: 200, y: 300 }, [])).toBe(0);
  });

  it("swaps slot when crossing 50% height threshold in a single vertical column", () => {
    const siblings: SiblingRectItem[] = [
      {
        key: "gauges" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 100, bottom: 300, width: 400, height: 200 }, // midY = 200
      },
      {
        key: "recent_records" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 320, bottom: 520, width: 400, height: 200 }, // midY = 420
      },
      {
        key: "charts" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 540, bottom: 740, width: 400, height: 200 }, // midY = 640
      },
    ];

    // Drag center above Card A vertical center (200) -> drop before Card A (index 0)
    expect(computeTargetDropIndex({ x: 250, y: 150 }, siblings)).toBe(0);

    // Drag center crosses 50% height of Card A (y >= 200, but closer to A than B) -> drop after Card A (index 1)
    expect(computeTargetDropIndex({ x: 250, y: 220 }, siblings)).toBe(1);

    // Drag center in upper half of Card B (y < 420, closer to B than A) -> drop before Card B (index 1)
    expect(computeTargetDropIndex({ x: 250, y: 380 }, siblings)).toBe(1);

    // Drag center crosses 50% height of Card B (y >= 420) -> drop after Card B (index 2)
    expect(computeTargetDropIndex({ x: 250, y: 460 }, siblings)).toBe(2);

    // Drag center in lower half of Card C (y >= 640) -> drop after Card C (index 3)
    expect(computeTargetDropIndex({ x: 250, y: 700 }, siblings)).toBe(3);
  });

  it("correctly identifies target slot in 2-column bento desktop layout", () => {
    const bentoSiblings: SiblingRectItem[] = [
      // Row 0 Col 1
      {
        key: "gauges" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 100, bottom: 300, width: 400, height: 200 }, // center (250, 200)
      },
      // Row 0 Col 2
      {
        key: "recent_records" as DashboardCardKey,
        rect: { left: 470, right: 870, top: 100, bottom: 300, width: 400, height: 200 }, // center (670, 200)
      },
      // Row 1 Col 1 (Span 2)
      {
        key: "charts" as DashboardCardKey,
        rect: { left: 50, right: 870, top: 320, bottom: 620, width: 820, height: 300 }, // center (460, 470)
      },
    ];

    // Hovering over top half of Col 2 card (recent_records):
    // Drag center (670, 150) -> closest to recent_records, top half -> index 1
    expect(computeTargetDropIndex({ x: 670, y: 150 }, bentoSiblings)).toBe(1);

    // Hovering over bottom half of Col 2 card:
    // Drag center (670, 250) -> closest to recent_records, bottom half -> index 2
    expect(computeTargetDropIndex({ x: 670, y: 250 }, bentoSiblings)).toBe(2);

    // Hovering over top half of Col 1 card (gauges):
    // Drag center (250, 150) -> closest to gauges, top half -> index 0
    expect(computeTargetDropIndex({ x: 250, y: 150 }, bentoSiblings)).toBe(0);

    // Hovering over lower half of bottom chart card:
    // Drag center (460, 550) -> closest to charts, bottom half -> index 3
    expect(computeTargetDropIndex({ x: 460, y: 550 }, bentoSiblings)).toBe(3);
  });
});

describe("DashboardDropPlaceholder Component", () => {
  it("renders with exact height and col-span-1 classes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardDropPlaceholder, { height: 240, span: 1 }),
    );
    expect(markup).toContain('id="dashboard-drop-placeholder"');
    expect(markup).toContain("widget-drop-placeholder");
    expect(markup).toContain("animate-placeholder-enter");
    expect(markup).toContain("lg:col-span-1");
    expect(markup).toContain("height:240px");
    expect(markup).toContain("Drop widget here");
  });

  it("renders with full width col-span-2 when span is 2", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardDropPlaceholder, { height: 350, span: 2 }),
    );
    expect(markup).toContain("lg:col-span-2");
    expect(markup).toContain("height:350px");
  });
});

describe("Scroll Container Resolution", () => {
  it("safely handles server-side / node environment", () => {
    // In node environment, window is undefined
    const container = getScrollContainer(null);
    expect(container).toBeNull();
  });
});

describe("Dashboard Drag-and-Drop Edge Cases & Contract", () => {
  it("handles single-card dashboard correctly without crashing or invalid indices", () => {
    // When only 1 card is visible, siblings array is empty
    const siblings: SiblingRectItem[] = [];
    expect(computeTargetDropIndex({ x: 200, y: 300 }, siblings)).toBe(0);
    expect(computeTargetDropIndex({ x: 0, y: 0 }, siblings)).toBe(0);
    expect(computeTargetDropIndex({ x: 1000, y: 5000 }, siblings)).toBe(0);
  });

  it("handles cards of varying heights in a single column", () => {
    const varyingSiblings: SiblingRectItem[] = [
      {
        key: "gauges" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 0, bottom: 150, width: 400, height: 150 }, // midY = 75
      },
      {
        key: "recent_records" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 170, bottom: 490, width: 400, height: 320 }, // midY = 330
      },
      {
        key: "cashflow_table" as DashboardCardKey,
        rect: { left: 50, right: 450, top: 510, bottom: 910, width: 400, height: 400 }, // midY = 710
      },
    ];

    // Above first card center (75) -> index 0
    expect(computeTargetDropIndex({ x: 250, y: 50 }, varyingSiblings)).toBe(0);
    // Crossed first card center (75) -> index 1
    expect(computeTargetDropIndex({ x: 250, y: 100 }, varyingSiblings)).toBe(1);
    // Before second card center (330) -> index 1
    expect(computeTargetDropIndex({ x: 250, y: 250 }, varyingSiblings)).toBe(1);
    // Crossed second card center (330) -> index 2
    expect(computeTargetDropIndex({ x: 250, y: 360 }, varyingSiblings)).toBe(2);
    // Before third card center (710) -> index 2
    expect(computeTargetDropIndex({ x: 250, y: 600 }, varyingSiblings)).toBe(2);
    // Crossed third card center (710) -> index 3
    expect(computeTargetDropIndex({ x: 250, y: 800 }, varyingSiblings)).toBe(3);
  });

  it("clamps auto-scroll velocity at max speed for extreme pointer coordinates", () => {
    const top = 100;
    const bottom = 900;
    // Way above viewport (-500)
    expect(computeAutoScrollVelocity(-500, top, bottom, 16)).toBe(-16);
    // Way below viewport (+2500)
    expect(computeAutoScrollVelocity(2500, top, bottom, 16)).toBe(16);
  });
});
