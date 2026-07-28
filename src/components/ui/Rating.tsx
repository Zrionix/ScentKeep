import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Text } from './Text';

export interface RatingProps {
  value: number;
  /** Omit to render read-only. */
  onChange?: (value: number) => void;
  max?: number;
  /** Shown above the row. */
  label?: string;
  size?: number;
  testID?: string;
}

/**
 * A 1–5 rating row used for overall rating, longevity and sillage.
 *
 * Tapping the currently-selected value clears it back to 0 — without that,
 * a mis-tap on a 5-point scale is permanent, and "no opinion" is a real answer
 * for longevity on a bottle you have worn once.
 */
export function Rating({ value, onChange, max = 5, label, size = 26, testID }: RatingProps) {
  const readOnly = !onChange;

  return (
    <View testID={testID}>
      {label ? (
        <Text variant="overline" tone="tertiary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={styles.row}
        accessibilityRole={readOnly ? 'text' : 'adjustable'}
        accessibilityLabel={`${label ?? 'Rating'}: ${value} out of ${max}`}
        accessibilityValue={{ min: 0, max, now: value }}
      >
        {Array.from({ length: max }, (_, i) => {
          const index = i + 1;
          const filled = index <= value;
          const glyph = (
            <Text
              style={[styles.star, { fontSize: size, lineHeight: size * 1.15 }]}
              tone={filled ? 'accent' : 'faint'}
            >
              {filled ? '★' : '☆'}
            </Text>
          );

          if (readOnly) return <View key={index}>{glyph}</View>;

          return (
            <Pressable
              key={index}
              testID={`${testID ?? 'rating'}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Set ${label ?? 'rating'} to ${index}`}
              hitSlop={6}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(value === index ? 0 : index);
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              {glyph}
            </Pressable>
          );
        })}
        {readOnly && value === 0 ? (
          <Text variant="caption" tone="faint" style={styles.unrated}>
            Not rated
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { includeFontPadding: false },
  unrated: { marginLeft: space.sm },
});
