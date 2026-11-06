import { describe, expect, it } from "vitest";
import {
  createMockLocalStorage,
  createMockMatchMedia,
  ThemeManager,
  type Theme,
  type ResolvedTheme,
} from "./test-harness";

describe("R3: Theme Management & System Mode (Tiers 1-4)", () => {
  // ==========================================================================
  // Tier 1: Feature Coverage (>= 5 tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: defaults to system theme and resolves to OS preference on initialization", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false); // OS = light

      const manager = new ThemeManager({ storage, matchMedia });

      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light");
      manager.destroy();
    });

    it("T1.2: resolves to dark when OS prefers dark and storage is unconfigured", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(true); // OS = dark

      const manager = new ThemeManager({ storage, matchMedia });

      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("dark");
      manager.destroy();
    });

    it("T1.3: explicit light mode writes color-scheme to localStorage and resolves to light", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(true); // OS = dark

      const manager = new ThemeManager({ storage, matchMedia });
      manager.setTheme("light");

      expect(manager.getTheme()).toBe("light");
      expect(manager.getResolvedTheme()).toBe("light");
      expect(storage.getItem("color-scheme")).toBe("light");
      manager.destroy();
    });

    it("T1.4: explicit dark mode writes color-scheme to localStorage and resolves to dark", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false); // OS = light

      const manager = new ThemeManager({ storage, matchMedia });
      manager.setTheme("dark");

      expect(manager.getTheme()).toBe("dark");
      expect(manager.getResolvedTheme()).toBe("dark");
      expect(storage.getItem("color-scheme")).toBe("dark");
      manager.destroy();
    });

    it("T1.5: dynamic matchMedia change listener updates resolvedTheme in system mode", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(false); // Start OS = light

      const manager = new ThemeManager({ storage, matchMedia });
      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light");

      // OS toggles to dark
      setDark(true);
      expect(manager.getResolvedTheme()).toBe("dark");

      // OS toggles back to light
      setDark(false);
      expect(manager.getResolvedTheme()).toBe("light");

      manager.destroy();
    });

    it("T1.6: cycles theme in exact required order: system -> light -> dark -> system", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false);

      const manager = new ThemeManager({ storage, matchMedia });
      expect(manager.getTheme()).toBe("system");

      // Cycle 1: system -> light
      manager.cycleTheme();
      expect(manager.getTheme()).toBe("light");
      expect(manager.getResolvedTheme()).toBe("light");
      expect(storage.getItem("color-scheme")).toBe("light");

      // Cycle 2: light -> dark
      manager.cycleTheme();
      expect(manager.getTheme()).toBe("dark");
      expect(manager.getResolvedTheme()).toBe("dark");
      expect(storage.getItem("color-scheme")).toBe("dark");

      // Cycle 3: dark -> system
      manager.cycleTheme();
      expect(manager.getTheme()).toBe("system");
      expect(storage.getItem("color-scheme")).toBe("system");

      manager.destroy();
    });

    it("T1.7: triggers onThemeChange callback with theme and resolvedTheme on state updates", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false);
      const history: Array<{ theme: Theme; resolved: ResolvedTheme }> = [];

      const manager = new ThemeManager({
        storage,
        matchMedia,
        onThemeChange: (theme, resolved) => {
          history.push({ theme, resolved });
        },
      });

      // Initial state recorded
      expect(history).toEqual([{ theme: "system", resolved: "light" }]);

      manager.setTheme("dark");
      expect(history[1]).toEqual({ theme: "dark", resolved: "dark" });

      manager.setTheme("system");
      expect(history[2]).toEqual({ theme: "system", resolved: "light" });

      manager.destroy();
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (>= 5 tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: missing or null localStorage value falls back cleanly to system mode", () => {
      const storage = createMockLocalStorage();
      expect(storage.getItem("color-scheme")).toBeNull();

      const { matchMedia } = createMockMatchMedia(true);
      const manager = new ThemeManager({ storage, matchMedia });

      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("dark");
      manager.destroy();
    });

    it("T2.2: invalid, unrecognized or corrupted localStorage values fall back to system mode", () => {
      const invalidValues = ["sepia", "auto", "neon", "null", "undefined", "", "  ", "TRUE", "dark-high-contrast"];

      for (const val of invalidValues) {
        const storage = createMockLocalStorage();
        storage.setItem("color-scheme", val);
        const { matchMedia } = createMockMatchMedia(false);

        const manager = new ThemeManager({ storage, matchMedia });
        expect(manager.getTheme()).toBe("system");
        expect(manager.getResolvedTheme()).toBe("light");
        manager.destroy();
      }
    });

    it("T2.3: rapid cycling over 12 consecutive cycles maintains predictable modulo 3 state", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(true); // OS = dark
      const manager = new ThemeManager({ storage, matchMedia });

      const expectedOrder: Theme[] = ["light", "dark", "system"];

      for (let i = 0; i < 12; i++) {
        manager.cycleTheme();
        const expectedTheme = expectedOrder[i % 3];
        expect(manager.getTheme()).toBe(expectedTheme);
        expect(storage.getItem("color-scheme")).toBe(expectedTheme);

        if (expectedTheme === "system") {
          expect(manager.getResolvedTheme()).toBe("dark"); // OS is dark
        } else {
          expect(manager.getResolvedTheme()).toBe(expectedTheme);
        }
      }

      manager.destroy();
    });

    it("T2.4: unsupported media query fallback defaults to light resolved theme", () => {
      const storage = createMockLocalStorage();
      // MatchMedia that matches neither dark nor light (e.g. headless/ancient environment)
      const mockMedia = (query: string) => {
        void query;
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
          simulateChange: () => {},
        };
      };

      const manager = new ThemeManager({ storage, matchMedia: mockMedia });
      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light");
      manager.destroy();
    });

    it("T2.5: ignores deprecated ff-theme storage key and strictly reads color-scheme", () => {
      const storage = createMockLocalStorage();
      storage.setItem("ff-theme", "dark"); // Deprecated key
      // "color-scheme" is unset

      const { matchMedia } = createMockMatchMedia(false);
      const manager = new ThemeManager({ storage, matchMedia });

      // Must not read "ff-theme"
      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light");
      manager.destroy();
    });

    it("T2.6: setting theme to existing current theme is idempotent and does not corrupt state", () => {
      const storage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false);
      let callCount = 0;

      const manager = new ThemeManager({
        storage,
        matchMedia,
        onThemeChange: () => {
          callCount++;
        },
      });

      expect(callCount).toBe(1); // Initial resolve
      manager.setTheme("system");
      expect(manager.getTheme()).toBe("system");
      expect(storage.getItem("color-scheme")).toBe("system");

      manager.setTheme("system");
      expect(manager.getTheme()).toBe("system");
      manager.destroy();
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations (>= 4 tests)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: OS preference shifts to dark while explicit theme is light — resolved remains light", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(false);

      const manager = new ThemeManager({ storage, matchMedia });
      manager.setTheme("light");
      expect(manager.getResolvedTheme()).toBe("light");

      // OS shifts to dark, but explicit override is active
      setDark(true);
      expect(manager.getTheme()).toBe("light");
      expect(manager.getResolvedTheme()).toBe("light");

      manager.destroy();
    });

    it("T3.2: OS preference shifts to light while explicit theme is dark — resolved remains dark", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(true);

      const manager = new ThemeManager({ storage, matchMedia });
      manager.setTheme("dark");
      expect(manager.getResolvedTheme()).toBe("dark");

      // OS shifts to light, but explicit override is active
      setDark(false);
      expect(manager.getTheme()).toBe("dark");
      expect(manager.getResolvedTheme()).toBe("dark");

      manager.destroy();
    });

    it("T3.3: resetting from explicit dark back to system immediately syncs to OS light preference", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(true);

      const manager = new ThemeManager({ storage, matchMedia });
      manager.setTheme("dark");
      expect(manager.getResolvedTheme()).toBe("dark");

      // OS shifts while user was in dark mode
      setDark(false);
      expect(manager.getResolvedTheme()).toBe("dark"); // Still pinned to dark

      // User switches back to system
      manager.setTheme("system");
      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light"); // Immediately mirrors OS

      manager.destroy();
    });

    it("T3.4: theme manager synchronizes with DOM root classList contract", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(false);

      // Emulate HTML documentElement classList
      const domClasses = new Set<string>();
      const syncDom = (_theme: Theme, resolved: ResolvedTheme) => {
        if (resolved === "dark") {
          domClasses.add("dark");
        } else {
          domClasses.delete("dark");
        }
      };

      const manager = new ThemeManager({
        storage,
        matchMedia,
        onThemeChange: syncDom,
      });

      expect(domClasses.has("dark")).toBe(false);

      // System adapts to OS dark
      setDark(true);
      expect(domClasses.has("dark")).toBe(true);

      // User overrides to light
      manager.setTheme("light");
      expect(domClasses.has("dark")).toBe(false);

      // User overrides to dark
      manager.setTheme("dark");
      expect(domClasses.has("dark")).toBe(true);

      manager.destroy();
    });

    it("T3.5: multiple ThemeManager instances sharing same storage observe persistent state", () => {
      const sharedStorage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(true);

      // Instance 1 sets preference to dark
      const manager1 = new ThemeManager({ storage: sharedStorage, matchMedia });
      manager1.setTheme("dark");
      expect(sharedStorage.getItem("color-scheme")).toBe("dark");
      manager1.destroy();

      // Instance 2 (representing a new page or tab) initializes from the same storage
      const manager2 = new ThemeManager({ storage: sharedStorage, matchMedia });
      expect(manager2.getTheme()).toBe("dark");
      expect(manager2.getResolvedTheme()).toBe("dark");
      manager2.destroy();
    });
  });

  // ==========================================================================
  // Tier 4: Real-World Application Scenarios (>= 2 tests)
  // ==========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1: Scenario - Complete user onboarding, day-to-night OS shift, manual override and restore", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(false); // Morning: OS is Light

      // Step 1: User opens wallet for the first time
      const session1 = new ThemeManager({ storage, matchMedia });
      expect(session1.getTheme()).toBe("system");
      expect(session1.getResolvedTheme()).toBe("light");

      // Step 2: Evening arrives; OS transitions automatically to dark mode
      setDark(true);
      expect(session1.getResolvedTheme()).toBe("dark");

      // Step 3: User prefers high contrast light mode in low light and manually sets theme to light
      session1.setTheme("light");
      expect(session1.getTheme()).toBe("light");
      expect(session1.getResolvedTheme()).toBe("light");
      expect(storage.getItem("color-scheme")).toBe("light");

      // Step 4: Next morning; OS shifts back to light mode, user resets to system mode
      setDark(false);
      session1.cycleTheme(); // light -> dark
      expect(session1.getTheme()).toBe("dark");
      session1.cycleTheme(); // dark -> system
      expect(session1.getTheme()).toBe("system");
      expect(session1.getResolvedTheme()).toBe("light"); // OS is light

      session1.destroy();
    });

    it("T4.2: Scenario - Persistent theme configuration surviving browser restarts and page reloads", () => {
      const persistentStorage = createMockLocalStorage();
      const { matchMedia } = createMockMatchMedia(false);

      // Session A: User navigates to settings and selects Dark mode
      const sessionA = new ThemeManager({ storage: persistentStorage, matchMedia });
      sessionA.setTheme("dark");
      expect(sessionA.getTheme()).toBe("dark");
      sessionA.destroy();

      // Browser restart / page reload: New session boots up
      const sessionB = new ThemeManager({ storage: persistentStorage, matchMedia });
      expect(sessionB.getTheme()).toBe("dark");
      expect(sessionB.getResolvedTheme()).toBe("dark");

      // User cycles theme: dark -> system
      sessionB.cycleTheme();
      expect(sessionB.getTheme()).toBe("system");
      expect(sessionB.getResolvedTheme()).toBe("light"); // OS is light
      expect(persistentStorage.getItem("color-scheme")).toBe("system");
      sessionB.destroy();

      // Third reload: System mode persists
      const sessionC = new ThemeManager({ storage: persistentStorage, matchMedia });
      expect(sessionC.getTheme()).toBe("system");
      expect(sessionC.getResolvedTheme()).toBe("light");
      sessionC.destroy();
    });

    it("T4.3: Scenario - Battery saver trigger on mobile device in system mode", () => {
      const storage = createMockLocalStorage();
      const { matchMedia, setDark } = createMockMatchMedia(false);

      const manager = new ThemeManager({ storage, matchMedia });
      expect(manager.getTheme()).toBe("system");
      expect(manager.getResolvedTheme()).toBe("light");

      // Mobile OS battery hits 15%, OS engages battery saver mode forcing dark appearance
      setDark(true);
      expect(manager.getResolvedTheme()).toBe("dark");

      // User plugs in phone, battery charges, battery saver disengages
      setDark(false);
      expect(manager.getResolvedTheme()).toBe("light");

      manager.destroy();
    });
  });
});
