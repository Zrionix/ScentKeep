import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { motion, palettes, type Palette, type ThemeName } from './index';

export type ThemePreference = ThemeName | 'system';

interface ThemeValue {
  /** The resolved theme actually being rendered. */
  name: ThemeName;
  colors: Palette;
  /** True when the OS "Reduce Motion" setting is on. */
  reduceMotion: boolean;
  /** Duration helper — collapses to 0 when the user asked for reduced motion. */
  duration: (ms: number) => number;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  children,
  preference = 'system',
}: {
  children: React.ReactNode;
  preference?: ThemePreference;
}) {
  const system = useColorScheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduceMotion(v);
      })
      .catch(() => {
        /* non-fatal: default to full motion */
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const value = useMemo<ThemeValue>(() => {
    // Dark is the product's default look, so an unknown system value resolves dark.
    const name: ThemeName = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    return {
      name,
      colors: palettes[name],
      reduceMotion,
      duration: (ms: number) => (reduceMotion ? motion.reduced : ms),
    };
  }, [preference, system, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  // Falling back to the dark palette keeps any component renderable in isolation
  // (unit tests, Storybook-style harnesses) without wrapping it in a provider.
  if (!ctx) {
    return {
      name: 'dark',
      colors: palettes.dark,
      reduceMotion: false,
      duration: (ms: number) => ms,
    };
  }
  return ctx;
}
