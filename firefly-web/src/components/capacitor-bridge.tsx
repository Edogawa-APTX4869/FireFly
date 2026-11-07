"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { useTheme } from "@/components/theme-provider";
import { globalEscapeStack } from "@/lib/use-escape-dismiss";

/**
 * Triggers a light native haptic tap when running inside the Capacitor Android APK.
 * Safe no-op on desktop/mobile web browsers.
 */
export async function triggerNativeHaptic(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    // Ignore on unsupported devices
  }
}

/**
 * Bridges native Android capabilities (Status Bar theme sync, Hardware Back Button
 * LIFO modal/drawer dismissal, and Splash Screen lifecycle) when running as an APK.
 */
export function CapacitorBridge() {
  const { resolvedTheme } = useTheme();

  // 1. Sync native Android status bar with active light/dark theme
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    const isDark = resolvedTheme === "dark";
    const bgColor = isDark ? "#161821" : "#f8f9fc";
    const barStyle = isDark ? Style.Dark : Style.Light;

    StatusBar.setStyle({ style: barStyle }).catch(() => {});
    StatusBar.setBackgroundColor({ color: bgColor }).catch(() => {});
  }, [resolvedTheme]);

  // 2. Hide native splash screen after initial client hydration
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
    SplashScreen.hide().catch(() => {});
  }, []);

  // 3. Wire Android hardware back button into the LIFO Escape stack & router history
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      // Priority 1: Dismiss topmost open modal, sheet, or navigation drawer
      const dismissedOverlay = globalEscapeStack.handleKeyDown("Escape");
      if (dismissedOverlay) {
        return;
      }

      // Priority 2: Navigate back in history if not on the home dashboard
      const path = window.location.pathname;
      if (path !== "/" || canGoBack) {
        window.history.back();
        return;
      }

      // Priority 3: On home dashboard with no overlays open -> minimize app
      App.minimizeApp().catch(() => {});
    });

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  return null;
}
