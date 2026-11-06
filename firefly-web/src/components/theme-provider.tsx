"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void; // cycles system -> light -> dark -> system
  systemTheme?: ResolvedTheme;
}

export const THEME_STORAGE_KEY = "color-scheme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  try {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "color-scheme";
      document.head.appendChild(meta);
    }
    meta.content = resolved;
  } catch {
    // ignore
  }

  try {
    root.style.colorScheme = resolved;
  } catch {
    // ignore
  }
}

// Event dispatcher for same-window storage updates
const themeChangeListeners = new Set<() => void>();
function notifyThemeChange() {
  themeChangeListeners.forEach((l) => l());
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  // 1. Subscribe to stored theme preference
  const theme = useSyncExternalStore<Theme>(
    useCallback(
      (onStoreChange) => {
        themeChangeListeners.add(onStoreChange);
        const handleStorage = (e: StorageEvent) => {
          if (e.key === storageKey) {
            onStoreChange();
          }
        };
        window.addEventListener("storage", handleStorage);
        return () => {
          themeChangeListeners.delete(onStoreChange);
          window.removeEventListener("storage", handleStorage);
        };
      },
      [storageKey],
    ),
    useCallback(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === "system" || stored === "light" || stored === "dark") {
          return stored;
        }
      } catch {
        // ignore
      }
      return defaultTheme;
    }, [defaultTheme, storageKey]),
    () => defaultTheme,
  );

  // 2. Subscribe to OS system theme preference
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    useCallback((onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => onStoreChange();

      if (mq.addEventListener) {
        mq.addEventListener("change", handleChange);
      } else if ((mq as unknown as { addListener: (cb: () => void) => void }).addListener) {
        (mq as unknown as { addListener: (cb: () => void) => void }).addListener(handleChange);
      }

      return () => {
        if (mq.removeEventListener) {
          mq.removeEventListener("change", handleChange);
        } else if ((mq as unknown as { removeListener: (cb: () => void) => void }).removeListener) {
          (mq as unknown as { removeListener: (cb: () => void) => void }).removeListener(handleChange);
        }
      };
    }, []),
    getSystemPreference,
    () => "light",
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // Synchronize DOM whenever resolvedTheme changes
  useEffect(() => {
    applyThemeToDom(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {
        // ignore
      }
      notifyThemeChange();
    },
    [storageKey],
  );

  const cycleTheme = useCallback(() => {
    // Cycle: system -> light -> dark -> system
    const current = (() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === "system" || stored === "light" || stored === "dark") return stored;
      } catch {
        // ignore
      }
      return defaultTheme;
    })();
    const next: Theme = current === "system" ? "light" : current === "light" ? "dark" : "system";
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
    notifyThemeChange();
  }, [defaultTheme, storageKey]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      cycleTheme,
      systemTheme,
    }),
    [theme, resolvedTheme, setTheme, cycleTheme, systemTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
