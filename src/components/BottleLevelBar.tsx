import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { BottleLevel, Projection } from '@/domain/bottleLevel';
import { radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export interface BottleLevelBarProps {
  level: BottleLevel;
  projection: Projection | null;
  sizeMl: number;
  /** Shown in the caveat, so the reader knows what the estimate assumed. */
  spraysPerWear: number;
  /** Opens the "set the real level" control. */
  onAdjust?: () => void;
  testID?: string;
}

/**
 * The bottle-level readout.
 *
 * The honesty rule for this component: when the figure is derived from wear
 * history it says "estimated", and when the user has measured it, it says so
 * instead. A number this specific looks authoritative, so it has to be clear
 * about which of the two it is.
 */
export function BottleLevelBar({
  level,
  projection,
  sizeMl,
  spraysPerWear,
  onAdjust,
  testID,
}: BottleLevelBarProps) {
  const { colors } = useTheme();

  const tone = level.isEmpty ? colors.danger : level.isLow ? colors.warning : colors.accent;
  const percent = Math.round(level.fraction * 100);

  return (
    <View testID={testID}>
      <View style={styles.headRow}>
        <Text variant="overline" tone="tertiary">
          {level.isEstimate ? 'Estimated level' : 'Measured level'}
        </Text>
        {onAdjust ? (
          <Pressable
            testID="adjust-level"
            onPress={onAdjust}
            accessibilityRole="button"
            accessibilityLabel="Set the real level of this bottle"
            hitSlop={8}
          >
            <Text variant="caption" tone="accent">
              Adjust
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.valueRow}
        accessibilityRole="progressbar"
        accessibilityLabel={`${percent} percent left, about ${level.remainingMl} of ${sizeMl} millilitres`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <Text variant="stat" style={{ color: tone }}>
          {percent}%
        </Text>
        <View style={styles.valueMeta}>
          <Text variant="small" tone="secondary">
            ~{level.remainingMl} of {sizeMl} ml
          </Text>
          <Text variant="caption" tone="faint">
            {level.wearsLeft > 0 ? `about ${level.wearsLeft} more wears` : 'nothing left'}
          </Text>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surface3 }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: tone, width: `${Math.max(2, percent)}%` },
          ]}
        />
      </View>

      {projection && projection.daysLeft !== null ? (
        <Text variant="small" tone={level.isLow ? 'danger' : 'tertiary'} style={styles.projection}>
          {level.isEmpty
            ? 'By this estimate it is finished.'
            : `At ${projection.wearsPerWeek} wears a week, ${projection.label.toLowerCase()} left.`}
        </Text>
      ) : (
        <Text variant="caption" tone="faint" style={styles.projection}>
          Log a few more wears and ScentKeep can tell you when it will run out.
        </Text>
      )}

      {level.isEstimate ? (
        <Text variant="caption" tone="faint" style={styles.caveat}>
          Estimated from {level.wearsCounted} {level.wearsCounted === 1 ? 'wear' : 'wears'} at{' '}
          {spraysPerWear} {spraysPerWear === 1 ? 'spray' : 'sprays'} each. Tap Adjust if you know the
          real level.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginBottom: space.md },
  valueMeta: { flex: 1 },
  track: { height: 10, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
  projection: { marginTop: space.md },
  caveat: { marginTop: 6, lineHeight: 15 },
});
