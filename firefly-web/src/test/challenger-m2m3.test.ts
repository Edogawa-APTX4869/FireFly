import { describe, expect, it, vi } from "vitest";
import {
  evaluateCalcExpression,
  applyDenominationChip,
} from "@/app/(app)/new/new-transaction";
import { EscapeStackManager } from "@/lib/use-escape-dismiss";
import { buildSearchQuery } from "@/app/(app)/transactions/transactions-client";

// ============================================================================
// DOM Mock & Keyboard Event Utilities for Component Logic Verification
// ============================================================================

interface MockDomNode {
  tagName: string;
  isContentEditable?: boolean;
  attributes?: Record<string, string>;
  parentNode?: MockDomNode | null;
  closest?: (selector: string) => MockDomNode | null;
  contains?: (node: MockDomNode | null) => boolean;
}

function createMockElement(
  tagName: string,
  attrs: Record<string, string> = {},
  parent: MockDomNode | null = null,
): MockDomNode {
  const el: MockDomNode = {
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    parentNode: parent,
    isContentEditable: attrs["contenteditable"] === "true" || attrs["contenteditable"] === "",
  };

  el.closest = (selector: string): MockDomNode | null => {
    const selectors = selector.split(",").map((s) => s.trim().toLowerCase());
    let curr: MockDomNode | null = el;

    while (curr) {
      const tag = curr.tagName.toLowerCase();
      for (const sel of selectors) {
        if (sel === tag) return curr;
        if (sel === "[contenteditable=true]" && curr.isContentEditable) return curr;
        if (sel.startsWith("[") && sel.endsWith("]")) {
          const attrName = sel.slice(1, -1);
          if (curr.attributes && attrName in curr.attributes) return curr;
        }
      }
      curr = curr.parentNode ?? null;
    }
    return null;
  };

  el.contains = (node: MockDomNode | null): boolean => {
    let curr = node;
    while (curr) {
      if (curr === el) return true;
      curr = curr.parentNode ?? null;
    }
    return false;
  };

  return el;
}

interface MockKeyboardEventOptions {
  key: string;
  target?: unknown;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

function createMockKeyboardEvent(options: MockKeyboardEventOptions) {
  let defaultPrevented = false;
  let propagationStopped = false;
  let immediatePropagationStopped = false;

  return {
    key: options.key,
    target: options.target ?? createMockElement("div"),
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    isComposing: options.isComposing ?? false,
    get defaultPrevented() {
      return defaultPrevented;
    },
    get propagationStopped() {
      return propagationStopped;
    },
    get immediatePropagationStopped() {
      return immediatePropagationStopped;
    },
    preventDefault: () => {
      defaultPrevented = true;
    },
    stopPropagation: () => {
      propagationStopped = true;
    },
    stopImmediatePropagation: () => {
      immediatePropagationStopped = true;
      propagationStopped = true;
    },
  };
}

/**
 * Filter Bar Desktop Keyboard Handler Implementation
 * Directly mirrors `firefly-web/src/components/filter-bar-desktop.tsx` lines 103-126
 */
function createFilterBarDesktopKeyHandler(callbacks: {
  stepPeriod: (direction: -1 | 1) => void;
  setPreset: (preset: string) => void;
  toggleDatePopover: () => void;
}) {
  return function onKeyDown(e: {
    target: unknown;
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
    preventDefault: () => void;
  }) {
    const el = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (el?.closest("input, textarea, select, [contenteditable=true]")) return;

    if (e.key === "[") {
      e.preventDefault();
      callbacks.stepPeriod(-1);
    } else if (e.key === "]") {
      e.preventDefault();
      callbacks.stepPeriod(1);
    } else if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      callbacks.setPreset("this_month");
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      callbacks.toggleDatePopover();
    }
  };
}

/**
 * App Shell Keyboard Handler Implementation
 * Directly mirrors `firefly-web/src/components/app-shell.tsx` lines 282-297
 */
function createAppShellKeyHandler(router: { push: (path: string) => void }) {
  return function onKey(e: {
    target: unknown;
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
    preventDefault?: () => void;
  }) {
    const el = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (el.closest("input, textarea, select, [contenteditable=true]")) return;
    if (e.key === "n") router.push("/new?type=withdrawal");
    if (e.key === "t") router.push("/new?type=transfer");
    if (e.key === "i") router.push("/new?type=deposit");
    if (e.key === "s" || e.key === "S") router.push("/reports");
    if (e.key === "/") {
      e.preventDefault?.();
      router.push("/transactions");
    }
  };
}

describe("Milestone 2 & 3 Adversarial Challenge & Stress Tests", () => {
  // ==========================================================================
  // Section 1: Desktop Filter Bar Keyboard Shortcuts ([, ], T, F)
  // ==========================================================================
  describe("1. Desktop Filter Bar Keyboard Shortcuts", () => {
    it("1.1: '[' key triggers stepPeriod(-1) and prevents default", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const event = createMockKeyboardEvent({ key: "[" });
      handler(event);

      expect(stepPeriod).toHaveBeenCalledWith(-1);
      expect(event.defaultPrevented).toBe(true);
    });

    it("1.2: ']' key triggers stepPeriod(1) and prevents default", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const event = createMockKeyboardEvent({ key: "]" });
      handler(event);

      expect(stepPeriod).toHaveBeenCalledWith(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it("1.3: 'T' and 't' jump to 'this_month' and prevent default", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const evT = createMockKeyboardEvent({ key: "T" });
      handler(evT);
      expect(setPreset).toHaveBeenCalledWith("this_month");
      expect(evT.defaultPrevented).toBe(true);

      const evt = createMockKeyboardEvent({ key: "t" });
      handler(evt);
      expect(setPreset).toHaveBeenCalledTimes(2);
      expect(evt.defaultPrevented).toBe(true);
    });

    it("1.4: 'F' and 'f' toggle date popover and prevent default", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const evF = createMockKeyboardEvent({ key: "F" });
      handler(evF);
      expect(toggleDatePopover).toHaveBeenCalledTimes(1);
      expect(evF.defaultPrevented).toBe(true);

      const evf = createMockKeyboardEvent({ key: "f" });
      handler(evf);
      expect(toggleDatePopover).toHaveBeenCalledTimes(2);
      expect(evf.defaultPrevented).toBe(true);
    });

    it("1.5: Modifier keys (Ctrl, Meta, Alt, IME composing) suppress all shortcuts", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      // Ctrl + T (browser new tab)
      const ctrlT = createMockKeyboardEvent({ key: "t", ctrlKey: true });
      handler(ctrlT);
      expect(setPreset).not.toHaveBeenCalled();
      expect(ctrlT.defaultPrevented).toBe(false);

      // Meta + F (browser search / mac cmd+f)
      const metaF = createMockKeyboardEvent({ key: "f", metaKey: true });
      handler(metaF);
      expect(toggleDatePopover).not.toHaveBeenCalled();
      expect(metaF.defaultPrevented).toBe(false);

      // Alt + [
      const altBracket = createMockKeyboardEvent({ key: "[", altKey: true });
      handler(altBracket);
      expect(stepPeriod).not.toHaveBeenCalled();
      expect(altBracket.defaultPrevented).toBe(false);

      // IME composition in progress
      const imeT = createMockKeyboardEvent({ key: "t", isComposing: true });
      handler(imeT);
      expect(setPreset).not.toHaveBeenCalled();
      expect(imeT.defaultPrevented).toBe(false);
    });

    it("1.6: Focus Guard on <input> suppresses all shortcuts", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const inputEl = createMockElement("input", { type: "text" });

      for (const key of ["[", "]", "t", "T", "f", "F"]) {
        const ev = createMockKeyboardEvent({ key, target: inputEl });
        handler(ev);
        expect(ev.defaultPrevented).toBe(false);
      }

      expect(stepPeriod).not.toHaveBeenCalled();
      expect(setPreset).not.toHaveBeenCalled();
      expect(toggleDatePopover).not.toHaveBeenCalled();
    });

    it("1.7: Focus Guard on <textarea> and <select> suppresses all shortcuts", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const textareaEl = createMockElement("textarea");
      const selectEl = createMockElement("select");

      const evArea = createMockKeyboardEvent({ key: "t", target: textareaEl });
      handler(evArea);
      expect(setPreset).not.toHaveBeenCalled();

      const evSelect = createMockKeyboardEvent({ key: "f", target: selectEl });
      handler(evSelect);
      expect(toggleDatePopover).not.toHaveBeenCalled();
    });

    it("1.8: Focus Guard on [contenteditable=true] suppresses all shortcuts", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const ceDiv = createMockElement("div", { contenteditable: "true" });
      const childSpan = createMockElement("span", {}, ceDiv);

      const ev = createMockKeyboardEvent({ key: "T", target: childSpan });
      handler(ev);
      expect(setPreset).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(false);
    });

    it("1.9: Focus Guard correctly identifies ancestor input when typing in nested element", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const inputParent = createMockElement("input", { type: "search" });
      const nestedIcon = createMockElement("span", {}, inputParent);

      const ev = createMockKeyboardEvent({ key: "[", target: nestedIcon });
      handler(ev);
      expect(stepPeriod).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(false);
    });

    it("1.10: [EMPIRICAL FINDING] el?.closest throws TypeError if target is Document or Window without closest()", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const handler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      // In browser DOM, Document and Window instances do not inherit Element.prototype.closest
      const mockDocument = { nodeType: 9, isDocument: true };
      const event = createMockKeyboardEvent({ key: "t", target: mockDocument });

      // el?.closest("...") evaluates (undefined)("...") when el is non-null but has no closest property
      expect(() => handler(event)).toThrow(TypeError);
    });

    it("1.11: [ADVERSARIAL CONFLICT] Lowercase 't' navigates to /new?type=transfer instead of staying on this_month", () => {
      const stepPeriod = vi.fn();
      const setPreset = vi.fn();
      const toggleDatePopover = vi.fn();
      const filterBarHandler = createFilterBarDesktopKeyHandler({ stepPeriod, setPreset, toggleDatePopover });

      const router = { push: vi.fn() };
      const appShellHandler = createAppShellKeyHandler(router);

      // When a user presses lowercase 't':
      const event = createMockKeyboardEvent({ key: "t" });

      // First filter bar processes event: sets preset and calls preventDefault
      filterBarHandler(event);
      expect(setPreset).toHaveBeenCalledWith("this_month");
      expect(event.defaultPrevented).toBe(true);

      // But app-shell does not check defaultPrevented and filter-bar didn't stopImmediatePropagation:
      appShellHandler(event);
      expect(router.push).toHaveBeenCalledWith("/new?type=transfer");
      // Result: App shell navigates away from the active page unexpectedly!
    });
  });

  // ==========================================================================
  // Section 2: App Shell Navigation Shortcuts & Focus Safety
  // ==========================================================================
  describe("2. App Shell Navigation Shortcuts", () => {
    it("2.1: 's' and 'S' navigate to /reports", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      const evLower = createMockKeyboardEvent({ key: "s" });
      handler(evLower);
      expect(router.push).toHaveBeenCalledWith("/reports");

      const evUpper = createMockKeyboardEvent({ key: "S" });
      handler(evUpper);
      expect(router.push).toHaveBeenCalledWith("/reports");
    });

    it("2.2: Modifiers (Ctrl+S, Meta+S, Alt+S) do NOT navigate to /reports", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      const ctrlS = createMockKeyboardEvent({ key: "s", ctrlKey: true });
      handler(ctrlS);
      expect(router.push).not.toHaveBeenCalled();

      const metaS = createMockKeyboardEvent({ key: "s", metaKey: true });
      handler(metaS);
      expect(router.push).not.toHaveBeenCalled();

      const altS = createMockKeyboardEvent({ key: "s", altKey: true });
      handler(altS);
      expect(router.push).not.toHaveBeenCalled();
    });

    it("2.3: Focus Guard on <input> suppresses 's' / 'S' navigation", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      const input = createMockElement("input", { type: "text" });
      const ev = createMockKeyboardEvent({ key: "s", target: input });
      handler(ev);

      expect(router.push).not.toHaveBeenCalled();
    });

    it("2.4: Focus Guard on <textarea> and [contenteditable=true] suppresses 's' navigation", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      const textarea = createMockElement("textarea");
      handler(createMockKeyboardEvent({ key: "s", target: textarea }));
      expect(router.push).not.toHaveBeenCalled();

      const ceDiv = createMockElement("div", { contenteditable: "true" });
      handler(createMockKeyboardEvent({ key: "S", target: ceDiv }));
      expect(router.push).not.toHaveBeenCalled();
    });

    it("2.5: '/' key navigates to /transactions and prevents default", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      const ev = createMockKeyboardEvent({ key: "/" });
      handler(ev);

      expect(router.push).toHaveBeenCalledWith("/transactions");
      expect(ev.defaultPrevented).toBe(true);
    });

    it("2.6: 'n' navigates to withdrawal and 'i' navigates to deposit", () => {
      const router = { push: vi.fn() };
      const handler = createAppShellKeyHandler(router);

      handler(createMockKeyboardEvent({ key: "n" }));
      expect(router.push).toHaveBeenCalledWith("/new?type=withdrawal");

      handler(createMockKeyboardEvent({ key: "i" }));
      expect(router.push).toHaveBeenCalledWith("/new?type=deposit");
    });
  });

  // ==========================================================================
  // Section 3: Popover Dismissal & Escape Stack LIFO Semantics
  // ==========================================================================
  describe("3. Popover Dismissal & Escape Stack LIFO Semantics", () => {
    it("3.1: Escape key dismisses registered popovers in strict LIFO order", () => {
      const manager = new EscapeStackManager();
      const dismissLog: string[] = [];

      const unregPeriod = manager.register("filter-period-menu", () => dismissLog.push("period"));
      const unregDate = manager.register("filter-custom-date", () => dismissLog.push("custom-date"));
      const unregAccount = manager.register("filter-account-menu", () => dismissLog.push("accounts"));

      expect(manager.getStackSize()).toBe(3);
      expect(manager.getTopId()).toBe("filter-account-menu");

      // 1st Escape: topmost ("filter-account-menu")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissLog).toEqual(["accounts"]);
      expect(manager.getStackSize()).toBe(2);

      // 2nd Escape: ("filter-custom-date")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissLog).toEqual(["accounts", "custom-date"]);
      expect(manager.getStackSize()).toBe(1);

      // 3rd Escape: ("filter-period-menu")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissLog).toEqual(["accounts", "custom-date", "period"]);
      expect(manager.getStackSize()).toBe(0);

      // 4th Escape: empty stack returns false
      expect(manager.handleKeyDown("Escape")).toBe(false);

      unregPeriod();
      unregDate();
      unregAccount();
    });

    it("3.2: Unregister callback cleans up stack entry without triggering dismissal", () => {
      const manager = new EscapeStackManager();
      let dismissed = false;

      const unregister = manager.register("temp-popover", () => {
        dismissed = true;
      });

      expect(manager.getStackSize()).toBe(1);
      unregister();
      expect(manager.getStackSize()).toBe(0);

      const handled = manager.handleKeyDown("Escape");
      expect(handled).toBe(false);
      expect(dismissed).toBe(false);
    });

    it("3.3: Re-registering identical ID moves it to the top of the stack", () => {
      const manager = new EscapeStackManager();
      const log: string[] = [];

      manager.register("menu-A", () => log.push("A"));
      manager.register("menu-B", () => log.push("B"));
      // Re-register menu-A
      manager.register("menu-A", () => log.push("A-updated"));

      expect(manager.getStackSize()).toBe(2);
      expect(manager.getTopId()).toBe("menu-A");

      manager.handleKeyDown("Escape");
      expect(log).toEqual(["A-updated"]);
    });

    it("3.4: Outside-click detection correctly distinguishes internal vs external clicks", () => {
      const popoverContainer = createMockElement("div", { id: "popover-root" });
      const popoverButton = createMockElement("button", {}, popoverContainer);
      const outsideButton = createMockElement("button", { id: "outside" });

      let isOpen = true;

      function simulateClickOutside(target: MockDomNode) {
        if (!popoverContainer.contains!(target)) {
          isOpen = false;
        }
      }

      // Click inside popover: remains open
      simulateClickOutside(popoverButton);
      expect(isOpen).toBe(true);

      // Click outside: closes
      simulateClickOutside(outsideButton);
      expect(isOpen).toBe(false);
    });
  });

  // ==========================================================================
  // Section 4: Milestone 3 Math Evaluator Stress Testing
  // ==========================================================================
  describe("4. Milestone 3 Math Evaluator (PEMDAS & Edge Cases)", () => {
    it("4.1: Standard PEMDAS Precedence: 150 + 25 * 3 equals 225 (not 525)", () => {
      expect(evaluateCalcExpression("150 + 25 * 3")).toBe("225");
    });

    it("4.2: Division precedence over addition and subtraction", () => {
      expect(evaluateCalcExpression("100 - 40 / 2")).toBe("80");
      expect(evaluateCalcExpression("10 + 60 / 3")).toBe("30");
    });

    it("4.3: Chained mixed operators with PEMDAS priority", () => {
      expect(evaluateCalcExpression("10 + 20 * 3 - 4 / 2")).toBe("68");
      expect(evaluateCalcExpression("2 * 3 + 4 * 5")).toBe("26");
    });

    it("4.4: Left-to-right evaluation for equal precedence operators", () => {
      expect(evaluateCalcExpression("50 / 5 * 2")).toBe("20");
      expect(evaluateCalcExpression("100 - 30 - 20")).toBe("50");
    });

    it("4.5: Parentheses precedence overrides standard operator precedence", () => {
      expect(evaluateCalcExpression("(150 + 25) * 3")).toBe("525");
      expect(evaluateCalcExpression("(100 - 40) / 2")).toBe("30");
      expect(evaluateCalcExpression("((10 + 5) * (8 - 2)) / 3")).toBe("30");
    });

    it("4.6: Unclosed parentheses tolerate gracefully without throwing", () => {
      expect(evaluateCalcExpression("(150 + 25")).toBe("175");
      expect(evaluateCalcExpression("150 + (25 * 3")).toBe("225");
    });

    it("4.7: Unary minus handling at start and after operators", () => {
      expect(evaluateCalcExpression("-50 + 100")).toBe("50");
      expect(evaluateCalcExpression("100 + -50")).toBe("50");
      expect(evaluateCalcExpression("-10 * -5")).toBe("50");
      expect(evaluateCalcExpression("-100 / -4")).toBe("25");
    });

    it("4.8: Unary plus handling", () => {
      expect(evaluateCalcExpression("+50 + +25")).toBe("75");
      expect(evaluateCalcExpression("+100")).toBe("100");
    });

    it("4.9: Exact decimal precision without floating point errors", () => {
      expect(evaluateCalcExpression("0.1 + 0.2")).toBe("0.3");
      expect(evaluateCalcExpression("0.07 * 100")).toBe("7");
    });

    it("4.10: Safe handling of division by zero", () => {
      expect(evaluateCalcExpression("100 / 0")).toBe("0");
      expect(evaluateCalcExpression("50 + 100 / 0")).toBe("50");
      expect(evaluateCalcExpression("0 / 100")).toBe("0");
    });

    it("4.11: Negative results clamped to '0'", () => {
      expect(evaluateCalcExpression("10 - 50")).toBe("0");
      expect(evaluateCalcExpression("-100")).toBe("0");
      expect(evaluateCalcExpression("50 - 100")).toBe("0");
    });

    it("4.12: Incomplete typing expressions evaluate live without throwing", () => {
      expect(evaluateCalcExpression("150 +")).toBe("150");
      expect(evaluateCalcExpression("250 *")).toBe("250");
      expect(evaluateCalcExpression("100 -")).toBe("100");
      expect(evaluateCalcExpression("80 /")).toBe("80");
      expect(evaluateCalcExpression("")).toBe("0");
      expect(evaluateCalcExpression("   ")).toBe("0");
    });

    it("4.13: Extraneous currency symbols and spaces ignored safely", () => {
      expect(evaluateCalcExpression("$150 + €25 * 3")).toBe("225");
      expect(evaluateCalcExpression("  $ 500  -  200  ")).toBe("300");
    });

    it("4.14: Malformed operator chains fall back to 0 cleanly", () => {
      expect(evaluateCalcExpression("++--**//")).toBe("0");
      expect(evaluateCalcExpression("....")).toBe("0");
    });

    it("4.15: applyDenominationChip evaluates expression and adds delta", () => {
      expect(applyDenominationChip("100", 50)).toBe("150");
      expect(applyDenominationChip("150 + 25 * 3", 25)).toBe("250");
      expect(applyDenominationChip("20", -50)).toBe("0"); // Clamped
    });
  });

  // ==========================================================================
  // Section 5: Transactions Client Universal Filter Query Integration
  // ==========================================================================
  describe("5. Transactions Client Universal Filter Integration", () => {
    it("5.1: buildSearchQuery incorporates universal date bounds", () => {
      const query = buildSearchQuery(
        {
          text: "",
          type: "",
          accountId: "",
          category: "",
          tag: "",
          budget: "",
          dateAfter: "",
          dateBefore: "",
          amountMore: "",
          amountLess: "",
        },
        {
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          accountFilter: "all_stats",
          selectedAccountIds: [],
        },
      );

      expect(query).toContain("date_after:2026-11-01");
      expect(query).toContain("date_before:2026-11-30");
    });

    it("5.2: buildSearchQuery with single custom account produces account_id:<id>", () => {
      const query = buildSearchQuery(
        {
          text: "",
          type: "",
          accountId: "",
          category: "",
          tag: "",
          budget: "",
          dateAfter: "",
          dateBefore: "",
          amountMore: "",
          amountLess: "",
        },
        {
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          accountFilter: "custom",
          selectedAccountIds: ["42"],
        },
      );

      expect(query).toContain("account_id:42");
    });

    it("5.3: buildSearchQuery with multiple custom accounts produces OR expression", () => {
      const query = buildSearchQuery(
        {
          text: "",
          type: "",
          accountId: "",
          category: "",
          tag: "",
          budget: "",
          dateAfter: "",
          dateBefore: "",
          amountMore: "",
          amountLess: "",
        },
        {
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          accountFilter: "custom",
          selectedAccountIds: ["1", "2", "3"],
        },
      );

      expect(query).toContain("(account_id:1 OR account_id:2 OR account_id:3)");
    });

    it("5.4: buildSearchQuery preserves backward compatibility when called with 1 argument", () => {
      const query = buildSearchQuery({
        text: "Groceries",
        type: "withdrawal",
        accountId: "5",
        category: "Food",
        tag: "",
        budget: "",
        dateAfter: "2026-10-01",
        dateBefore: "2026-10-31",
        amountMore: "",
        amountLess: "",
      });

      expect(query).toBe("type:withdrawal account_id:5 category_is:Food date_after:2026-10-01 date_before:2026-10-31 Groceries");
    });
  });
});
