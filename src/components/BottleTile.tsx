import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { Fragrance } from '@/domain/types';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export interface BottleTileProps {
  fragrance: Fragrance;
  onPress?: () => void;
  /** Grid tile width; the caller computes it from the screen. */
  width: number;
  /** Small badge in the corner, e.g. a wear count. */
  badge?: string;
  testID?: string;
}

/**
 * The wardrobe's signature element. A bottle without a photo still has to look
 * deliberate, so it falls back to a tinted panel keyed to the olfactory family
 * plus the house monogram — never a grey "no image" box.
 */
export function BottleTile({ fragrance, onPress, width, badge, testID }: BottleTileProps) {
  const { colors } = useTheme();
  const tint = colorForFamily(fragrance.family, colors);
  const monogram = (fragrance.brand || fragrance.name).trim().charAt(0).toUpperCase() || '·';

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${fragrance.name}${fragrance.brand ? ` by ${fragrance.brand}` : ''}${
        fragrance.rating ? `, rated ${fragrance.rating} of 5` : ''
      }`}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.frame,
          { height: width * 1.22, backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        {fragrance.photoUrl ? (
          <Image
            source={{ uri: fragrance.photoUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={180}
            accessible={false}
          />
        ) : (
          <LinearGradient
            colors={[`${tint}38`, `${tint}0D`]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.monogramWrap}>
              <Text style={[styles.monogram, { color: tint }]}>{monogram}</Text>
            </View>
          </LinearGradient>
        )}

        <View style={[styles.familyBar, { backgroundColor: tint }]} />

        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.scrim }]}>
            <Text variant="caption" tone="default">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="subtitle" numberOfLines={1} style={styles.name}>
        {fragrance.name}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {fragrance.brand || '—'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  monogramWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: { fontSize: 46, lineHeight: 54, fontWeight: '300', opacity: 0.85 },
  familyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, opacity: 0.9 },
  badge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  name: { marginTop: space.md },
});
