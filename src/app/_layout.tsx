import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrap } from '@/lib/bootstrap';
import { useStore } from '@/state/store';
import { palettes } from '@/theme';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Keep the native splash up until the persisted store has been read, so the app
// never flashes an empty wardrobe before the real one loads.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const themePreference = useStore((s) => s.settings.themePreference);
  const [booted, setBooted] = useState(false);

  // The display serif IS the app's typographic identity — without it every
  // headline silently falls back to the system sans and the whole editorial
  // look is gone. Only the one weight the type scale uses is bundled.
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
  });

  // A font that fails to load must not brick the app — `fontError` lets the UI
  // through on the system fallback rather than holding a black screen forever.
  const fontsReady = fontsLoaded || Boolean(fontError);
  const ready = hydrated && fontsReady;

  useEffect(() => {
    if (!hydrated) return;
    // Bootstrap runs AFTER hydration so it sees the user's real stored state,
    // and its result is never awaited by the UI — a slow network must not hold
    // the first paint.
    bootstrap()
      .catch(() => {})
      .finally(() => setBooted(true));
  }, [hydrated]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    // Matches the splash background exactly, so the handover is invisible.
    return <View style={{ flex: 1, backgroundColor: palettes.dark.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider preference={themePreference}>
          <StatusBarForTheme />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palettes.dark.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen
              name="paywall"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="bottle/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bottle/[id]" />
            <Stack.Screen name="log-sotd" options={{ presentation: 'modal' }} />
          </Stack>
          {/* `booted` is intentionally unused for rendering — the UI never waits
              on bootstrap. It exists so tests can assert startup completed. */}
          <View testID={booted ? 'boot-complete' : 'boot-pending'} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function StatusBarForTheme() {
  const themePreference = useStore((s) => s.settings.themePreference);
  // 'auto' lets the OS drive the bar when the user hasn't pinned a theme —
  // hardcoding 'light' there would leave black-on-black text in light mode.
  const style = themePreference === 'system' ? 'auto' : themePreference === 'light' ? 'dark' : 'light';
  return <StatusBar style={style} />;
}
