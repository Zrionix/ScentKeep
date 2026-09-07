import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { Fragrance } from '@/domain/types';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export interface RediscoverCardProps {
  fragrance: Fragrance;
  /** Honest span: "Never worn", "3 months ago". */
  lastWornLabel: string;
  onWear: () => void;
  onOpen: () => void;
}

/**
 * The "been a while" nudge.
 *
 * Domain already picks the bottle (`rediscoverSuggestion`) and the Insights
 * screen lists the full neglected set behind Premium. This card is the free,
 * daily version: one bottle, after today's log, so the next open still has a
 * reason. It never claims a streak is at risk.
 */
export function RediscoverCard({ fragrance, lastWornLabel, onWear, onOpen }: RediscoverCardProps) {
  const { colors } = useTheme();

  return (
    <Card
      testID="rediscover-card"
      style={[styles.card, { borderColor: colors.line }]}
      accessibilityLabel={`Been a while: ${fragrance.name}. ${lastWornLabel}.`}
    >
      <Text variant="overline" tone="tertiary">
        Been a while
      </Text>

      <Pressable
        testID="rediscover-open"
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${fragrance.name}`}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.swatch, { backgroundColor: colorForFamily(fragrance.family, colors) }]} />
        <View style={styles.fill}>
          <Text variant="subtitle" numberOfLines={2}>
            {fragrance.name}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {fragrance.brand ? `${fragrance.brand} · ${lastWornLabel}` : lastWornLabel}
          </Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          testID="rediscover-wear"
          onPress={onWear}
          accessibilityRole="button"
          accessibilityLabel={`Log ${fragrance.name} as today's scent`}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text variant="small" tone="onAccent">
            Wear this
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { marginBottom: space.lg, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  swatch: { width: 6, height: 40, borderRadius: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  primary: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
  },
});