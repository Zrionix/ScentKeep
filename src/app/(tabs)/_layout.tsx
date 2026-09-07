import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { selectNeedsOnboarding, useStore } from '@/state/store';
import { space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

/** Tab glyphs. Text glyphs keep the bundle free of an icon font while still
 *  reading as considered rather than default-blue-icons. */
const GLYPH = {
  wardrobe: '❖',
  diary: '◈',
  stats: '◧',
  settings: '⚙',
} as const;

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={styles.glyph} tone={focused ? 'accent' : 'faint'}>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const needsOnboarding = useStore(selectNeedsOnboarding);
  const hydrated = useStore((s) => s.hydrated);

  // Wait for hydration before deciding — redirecting on un-hydrated state would
  // bounce a returning user back through onboarding on every cold start.
  if (!hydrated) return null;
  if (needsOnboarding) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink4,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: space.sm,
        },
        tabBarLabelStyle: { fontSize: 10.5, letterSpacing: 0.6, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabGlyph glyph={GLYPH.wardrobe} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diary',
          tabBarIcon: ({ focused }) => <TabGlyph glyph={GLYPH.diary} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused }) => <TabGlyph glyph={GLYPH.stats} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabGlyph glyph={GLYPH.settings} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glyph: { fontSize: 19, lineHeight: 23 },
});
