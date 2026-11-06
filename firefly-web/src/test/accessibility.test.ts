import { describe, expect, it } from "vitest";
import {
  EscapeStackManager,
  meetsTouchTargetMinimum,
  parseCssPxDimension,
  hasSafeAreaInsets,
  type TouchTargetDimensions,
} from "./test-harness";

describe("R4: Universal Usability & Accessibility Standards (Tiers 1-4)", () => {
  // ==========================================================================
  // Tier 1: Feature Coverage (>= 5 tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: single registered overlay is dismissed when Escape key is pressed", () => {
      const manager = new EscapeStackManager();
      let dismissed = false;

      manager.register("modal-1", () => {
        dismissed = true;
      });

      expect(manager.getStackSize()).toBe(1);
      expect(manager.getTopId()).toBe("modal-1");

      const handled = manager.handleKeyDown("Escape");

      expect(handled).toBe(true);
      expect(dismissed).toBe(true);
      expect(manager.getStackSize()).toBe(0);
    });

    it("T1.2: LIFO ordering: multiple registered overlays dismiss in exact reverse order", () => {
      const manager = new EscapeStackManager();
      const dismissalOrder: string[] = [];

      manager.register("drawer", () => dismissalOrder.push("drawer"));
      manager.register("speed-dial", () => dismissalOrder.push("speed-dial"));
      manager.register("create-modal", () => dismissalOrder.push("create-modal"));

      expect(manager.getStackSize()).toBe(3);
      expect(manager.getTopId()).toBe("create-modal");

      // First Escape: topmost ("create-modal")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissalOrder).toEqual(["create-modal"]);
      expect(manager.getTopId()).toBe("speed-dial");

      // Second Escape: ("speed-dial")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissalOrder).toEqual(["create-modal", "speed-dial"]);
      expect(manager.getTopId()).toBe("drawer");

      // Third Escape: base ("drawer")
      expect(manager.handleKeyDown("Escape")).toBe(true);
      expect(dismissalOrder).toEqual(["create-modal", "speed-dial", "drawer"]);
      expect(manager.getStackSize()).toBe(0);
    });

    it("T1.3: unregister callback removes overlay without triggering its dismissal", () => {
      const manager = new EscapeStackManager();
      let dismissed = false;

      const unregister = manager.register("popup", () => {
        dismissed = true;
      });

      expect(manager.getStackSize()).toBe(1);

      // Unregister before Escape is pressed
      unregister();

      expect(manager.getStackSize()).toBe(0);
      expect(manager.handleKeyDown("Escape")).toBe(false);
      expect(dismissed).toBe(false);
    });

    it("T1.4: touch target contract validates elements meeting or exceeding 48px x 48px", () => {
      const validTargets: TouchTargetDimensions[] = [
        { width: 48, height: 48 },
        { width: 56, height: 56 }, // FAB button standard
        { width: 120, height: 48 }, // standard action button
        { width: 48, height: 64 },
        { width: 200, height: 52 },
      ];

      for (const target of validTargets) {
        expect(meetsTouchTargetMinimum(target)).toBe(true);
      }

      const invalidTargets: TouchTargetDimensions[] = [
        { width: 40, height: 40 }, // old Button md
        { width: 32, height: 32 }, // old Button sm
        { width: 28, height: 28 }, // old icon close
        { width: 48, height: 36 }, // sub-48 height
        { width: 36, height: 48 }, // sub-48 width
      ];

      for (const target of invalidTargets) {
        expect(meetsTouchTargetMinimum(target)).toBe(false);
      }
    });

    it("T1.5: safe-area insets contract validates declarations of top and bottom safe-areas", () => {
      const mobileHeaderCss = "pt-[calc(0.625rem+env(safe-area-inset-top))] px-4";
      const mobileDrawerCss = "pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-safe";
      const edgeToEdgeContainer =
        "padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";

      const headerCheck = hasSafeAreaInsets(mobileHeaderCss);
      expect(headerCheck.top).toBe(true);
      expect(headerCheck.bottom).toBe(false);

      const drawerCheck = hasSafeAreaInsets(mobileDrawerCss);
      expect(drawerCheck.bottom).toBe(true);

      const edgeCheck = hasSafeAreaInsets(edgeToEdgeContainer);
      expect(edgeCheck.top).toBe(true);
      expect(edgeCheck.bottom).toBe(true);
      expect(edgeCheck.left).toBe(true);
      expect(edgeCheck.right).toBe(true);
    });

    it("T1.6: non-Escape keys do not dismiss registered overlays", () => {
      const manager = new EscapeStackManager();
      let dismissed = false;

      manager.register("modal", () => {
        dismissed = true;
      });

      const nonEscapeKeys = ["Enter", "Tab", "Space", "Backspace", "ArrowDown", "Shift", "a", "Escape1"];

      for (const key of nonEscapeKeys) {
        expect(manager.handleKeyDown(key)).toBe(false);
        expect(dismissed).toBe(false);
        expect(manager.getStackSize()).toBe(1);
      }
    });

    it("T1.7: getTopId reflects current topmost dismissible ID accurately", () => {
      const manager = new EscapeStackManager();
      expect(manager.getTopId()).toBeUndefined();

      manager.register("layer-1", () => {});
      expect(manager.getTopId()).toBe("layer-1");

      manager.register("layer-2", () => {});
      expect(manager.getTopId()).toBe("layer-2");

      manager.handleKeyDown("Escape");
      expect(manager.getTopId()).toBe("layer-1");

      manager.handleKeyDown("Escape");
      expect(manager.getTopId()).toBeUndefined();
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (>= 5 tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: pressing Escape on empty stack returns false and does not throw", () => {
      const manager = new EscapeStackManager();
      expect(manager.getStackSize()).toBe(0);

      expect(() => manager.handleKeyDown("Escape")).not.toThrow();
      expect(manager.handleKeyDown("Escape")).toBe(false);
    });

    it("T2.2: rapid successive Escape presses safely drain stack and reject surplus presses", () => {
      const manager = new EscapeStackManager();
      let count = 0;

      manager.register("item-1", () => count++);
      manager.register("item-2", () => count++);

      expect(manager.getStackSize()).toBe(2);

      const results = [
        manager.handleKeyDown("Escape"), // dismiss item-2
        manager.handleKeyDown("Escape"), // dismiss item-1
        manager.handleKeyDown("Escape"), // extra
        manager.handleKeyDown("Escape"), // extra
        manager.handleKeyDown("Escape"), // extra
      ];

      expect(results).toEqual([true, true, false, false, false]);
      expect(count).toBe(2);
      expect(manager.getStackSize()).toBe(0);
    });

    it("T2.3: mid-stack unregistration preserves ordering of remaining overlays", () => {
      const manager = new EscapeStackManager();
      const dismissed: string[] = [];

      manager.register("base-modal", () => dismissed.push("base-modal"));
      const unregisterMid = manager.register("mid-popover", () => dismissed.push("mid-popover"));
      manager.register("top-dialog", () => dismissed.push("top-dialog"));

      expect(manager.getStackSize()).toBe(3);

      // Mid-popover is closed via click-away
      unregisterMid();

      expect(manager.getStackSize()).toBe(2);
      expect(manager.getTopId()).toBe("top-dialog");

      // First Escape dismisses top-dialog
      manager.handleKeyDown("Escape");
      expect(dismissed).toEqual(["top-dialog"]);
      expect(manager.getTopId()).toBe("base-modal");

      // Second Escape dismisses base-modal
      manager.handleKeyDown("Escape");
      expect(dismissed).toEqual(["top-dialog", "base-modal"]);
      expect(manager.getStackSize()).toBe(0);
    });

    it("T2.4: calling unregister multiple times is idempotent and does not corrupt stack", () => {
      const manager = new EscapeStackManager();

      const unregisterA = manager.register("modal-a", () => {});
      manager.register("modal-b", () => {});

      expect(manager.getStackSize()).toBe(2);

      // Multiple unregister calls for modal-a
      unregisterA();
      unregisterA();
      unregisterA();

      expect(manager.getStackSize()).toBe(1);
      expect(manager.getTopId()).toBe("modal-b");
    });

    it("T2.5: sub-pixel touch target boundary verification (47.9px vs 48.0px)", () => {
      expect(meetsTouchTargetMinimum({ width: 47.99, height: 48 })).toBe(false);
      expect(meetsTouchTargetMinimum({ width: 48, height: 47.99 })).toBe(false);
      expect(meetsTouchTargetMinimum({ width: 48.0, height: 48.0 })).toBe(true);
      expect(meetsTouchTargetMinimum({ width: 48.25, height: 50.5 })).toBe(true);

      // Parse CSS pixel values
      expect(parseCssPxDimension("48px")).toBe(48);
      expect(parseCssPxDimension("47.9px")).toBe(47.9);
      expect(parseCssPxDimension("56px")).toBe(56);
      expect(parseCssPxDimension("invalid")).toBe(0);
    });

    it("T2.6: clear method instantly resets stack to empty state", () => {
      const manager = new EscapeStackManager();
      manager.register("1", () => {});
      manager.register("2", () => {});
      manager.register("3", () => {});

      expect(manager.getStackSize()).toBe(3);
      manager.clear();

      expect(manager.getStackSize()).toBe(0);
      expect(manager.getTopId()).toBeUndefined();
      expect(manager.handleKeyDown("Escape")).toBe(false);
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations (>= 4 tests)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: CreateAccountModal open over Speed Dial FAB dismisses modal then FAB", () => {
      const manager = new EscapeStackManager();
      let fabOpen = true;
      let modalOpen = true;

      // 1. User opens FAB
      const unregFab = manager.register("speed-dial-fab", () => {
        fabOpen = false;
      });

      // 2. User clicks 'New account' action pill, opening modal over FAB
      const unregModal = manager.register("create-account-modal", () => {
        modalOpen = false;
      });

      expect(manager.getStackSize()).toBe(2);

      // User presses Escape: modal must dismiss first
      manager.handleKeyDown("Escape");
      expect(modalOpen).toBe(false);
      expect(fabOpen).toBe(true);
      unregModal(); // modal unmounts

      // Second Escape: FAB must dismiss
      manager.handleKeyDown("Escape");
      expect(fabOpen).toBe(false);
      unregFab(); // FAB unmounts

      // Third Escape: nothing to dismiss
      expect(manager.handleKeyDown("Escape")).toBe(false);
    });

    it("T3.2: AccountPicker dropdown inside CreateAccountModal dismisses dropdown then modal", () => {
      const manager = new EscapeStackManager();
      let pickerOpen = true;
      let modalOpen = true;

      // Modal is open
      const unregModal = manager.register("create-account-modal", () => {
        modalOpen = false;
      });

      // Inside modal, user opens currency picker
      const unregPicker = manager.register("currency-picker-dropdown", () => {
        pickerOpen = false;
      });

      // Press Escape: picker closes, modal stays open
      manager.handleKeyDown("Escape");
      expect(pickerOpen).toBe(false);
      expect(modalOpen).toBe(true);
      unregPicker();

      // Next Escape: modal closes
      manager.handleKeyDown("Escape");
      expect(modalOpen).toBe(false);
      unregModal();
    });

    it("T3.3: Mobile Nav Drawer open, user opens Theme Settings popup: dismisses popup then drawer", () => {
      const manager = new EscapeStackManager();
      let drawerOpen = true;
      let themePopupOpen = true;

      // 1. Mobile drawer open
      manager.register("mobile-nav-drawer", () => {
        drawerOpen = false;
      });

      // 2. Theme switcher dialog open from drawer
      manager.register("theme-switcher-dialog", () => {
        themePopupOpen = false;
      });

      // Press Escape: dismiss theme switcher
      manager.handleKeyDown("Escape");
      expect(themePopupOpen).toBe(false);
      expect(drawerOpen).toBe(true);

      // Press Escape again: dismiss mobile drawer
      manager.handleKeyDown("Escape");
      expect(drawerOpen).toBe(false);
    });

    it("T3.4: Safe-area bottom container preserves >=48px interactive touch boundary on FAB", () => {
      // FAB button specifications: 56px x 56px with safe-area bottom offset
      const fabDimensions: TouchTargetDimensions = { width: 56, height: 56 };
      const fabContainerCss = "bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4";

      expect(meetsTouchTargetMinimum(fabDimensions)).toBe(true);
      expect(hasSafeAreaInsets(fabContainerCss).bottom).toBe(true);
    });

    it("T3.5: dynamic registration inside dismiss callback creates nested prompt handling", () => {
      const manager = new EscapeStackManager();
      let confirmDialogActive = false;
      let formAbandoned = false;

      // Register form with unsaved changes prompt on dismiss
      manager.register("form-with-changes", () => {
        // Instead of immediate close, open confirmation prompt
        confirmDialogActive = true;
        manager.register("confirm-discard-modal", () => {
          confirmDialogActive = false;
          formAbandoned = true;
        });
      });

      // Escape 1: triggers prompt registration
      manager.handleKeyDown("Escape");
      expect(confirmDialogActive).toBe(true);
      expect(formAbandoned).toBe(false);
      expect(manager.getTopId()).toBe("confirm-discard-modal");

      // Escape 2: confirms discard
      manager.handleKeyDown("Escape");
      expect(confirmDialogActive).toBe(false);
      expect(formAbandoned).toBe(true);
      expect(manager.getStackSize()).toBe(0);
    });
  });

  // ==========================================================================
  // Tier 4: Real-World Application Scenarios (>= 2 tests)
  // ==========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1: Scenario - Complete Mobile User Overlay Workflow with Safe Areas and Escape Navigation", () => {
      const manager = new EscapeStackManager();
      const openOverlays: string[] = [];

      // Step 1: User navigates on mobile device with top notch & bottom home indicator
      const mobileShellCss =
        "pt-[calc(0.625rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]";
      const insets = hasSafeAreaInsets(mobileShellCss);
      expect(insets.top).toBe(true);
      expect(insets.bottom).toBe(true);

      // Step 2: User opens mobile navigation drawer
      openOverlays.push("mobile-drawer");
      const unregDrawer = manager.register("mobile-drawer", () => {
        const idx = openOverlays.indexOf("mobile-drawer");
        if (idx !== -1) openOverlays.splice(idx, 1);
      });
      expect(openOverlays).toEqual(["mobile-drawer"]);

      // Step 3: From drawer, user opens Speed Dial FAB
      openOverlays.push("speed-dial-fab");
      const unregFab = manager.register("speed-dial-fab", () => {
        const idx = openOverlays.indexOf("speed-dial-fab");
        if (idx !== -1) openOverlays.splice(idx, 1);
      });
      expect(openOverlays).toEqual(["mobile-drawer", "speed-dial-fab"]);

      // Step 4: User clicks 'New account', opening CreateAccountModal
      openOverlays.push("create-account-modal");
      const unregModal = manager.register("create-account-modal", () => {
        const idx = openOverlays.indexOf("create-account-modal");
        if (idx !== -1) openOverlays.splice(idx, 1);
      });
      expect(openOverlays).toEqual(["mobile-drawer", "speed-dial-fab", "create-account-modal"]);

      // Step 5: Keyboard connected (e.g. iPad Magic Keyboard or desktop emulation)
      // Press Escape once -> dismisses CreateAccountModal
      manager.handleKeyDown("Escape");
      expect(openOverlays).toEqual(["mobile-drawer", "speed-dial-fab"]);
      unregModal();

      // Press Escape twice -> dismisses Speed Dial FAB
      manager.handleKeyDown("Escape");
      expect(openOverlays).toEqual(["mobile-drawer"]);
      unregFab();

      // Press Escape thrice -> dismisses Mobile Navigation Drawer
      manager.handleKeyDown("Escape");
      expect(openOverlays).toEqual([]);
      unregDrawer();

      expect(manager.getStackSize()).toBe(0);
    });

    it("T4.2: Scenario - Touch target accessibility audit across all interactive UI controls", () => {
      // Audit all primary application controls against WCAG touch target standards (>= 48px)
      interface ControlSpec {
        name: string;
        width: number;
        height: number;
      }

      const auditedControls: ControlSpec[] = [
        { name: "Button (sm) with coarse pointer min-h-12", width: 48, height: 48 },
        { name: "Button (md) standard action", width: 120, height: 48 },
        { name: "Button (lg) primary CTA", width: 160, height: 52 },
        { name: "Icon Button (header theme toggle)", width: 48, height: 48 },
        { name: "Icon Button (mobile hamburger menu)", width: 48, height: 48 },
        { name: "Speed Dial FAB main trigger button", width: 56, height: 56 },
        { name: "Speed Dial FAB action pill (New account)", width: 150, height: 48 },
        { name: "ModalSheet close button touch target", width: 48, height: 48 },
        { name: "Navigation Tab touch area", width: 80, height: 48 },
      ];

      for (const control of auditedControls) {
        const passes = meetsTouchTargetMinimum({
          width: control.width,
          height: control.height,
        });
        expect(passes, `Control '${control.name}' must satisfy >=48px touch target contract`).toBe(true);
      }
    });

    it("T4.3: Scenario - Data entry form interruption and keyboard dismiss flow", () => {
      const manager = new EscapeStackManager();
      const formState = {
        name: "Joint Household",
        type: "asset",
        notes: "Work in progress",
      };
      let modalOpen = true;

      manager.register("create-account-modal", () => {
        modalOpen = false;
      });

      // User triggers sub-selection dropdown
      let dropdownOpen = true;
      manager.register("role-dropdown", () => {
        dropdownOpen = false;
      });

      // Escape 1: Closes dropdown without closing modal or losing form data
      manager.handleKeyDown("Escape");
      expect(dropdownOpen).toBe(false);
      expect(modalOpen).toBe(true);
      expect(formState.name).toBe("Joint Household");

      // Escape 2: Closes modal
      manager.handleKeyDown("Escape");
      expect(modalOpen).toBe(false);
    });
  });
});
