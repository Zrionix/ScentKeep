import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrap } from '@/lib/bootstrap';
import { maybeAskReview, noteAppOpen } from '@/lib/growth';
import { useStore } from '@/state/store';
import { palettes } from '@/theme';
import { ThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const themePreference = useStore((s) => s.settings.themePreference);
  const [booted, setBooted] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
  });

  const fontsReady = fontsLoaded || Boolean(fontError);
  const ready = hydrated && fontsReady;

  useEffect(() => {
    if (!hydrated) return;
    bootstrap()
      .catch(() => {})
      .finally(() => setBooted(true));
    noteAppOpen().then(() => maybeAskReview()).catch(() => {});
  }, [hydrated]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
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
            <Stack.Screen name="share" options={{ presentation: 'modal' }} />
          </Stack>
          <View testID={booted ? 'boot-complete' : 'boot-pending'} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function StatusBarForTheme() {
  const themePreference = useStore((s) => s.settings.themePreference);
  const style = themePreference === 'system' ? 'auto' : themePreference === 'light' ? 'dark' : 'light';
  return <StatusBar style={style} />;
}
