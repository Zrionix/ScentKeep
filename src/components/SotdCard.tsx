import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { SotdCardData } from '@/domain/sotdCard';
import { colorForFamily, palettes, space } from '@/theme';

// The daily card people actually post.
//
// Same two decisions as the shelf card, for the same reasons:
//
// 1. ALWAYS the dark palette. The card leaves the app and lands in someone
//    else's feed; it has to look like ScentKeep, not like a screenshot of a
//    setting.
//
// 2. Fixed 4:5 frame, captured at 3x. Instagram shows 4:5 in full; the same
//    bitmap survives Stories (letterboxed) and a square crop without the
//    wordmark falling off.

/** Same frame as the shelf card -- one export size, two compositions. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_SCALE = 3;
export const CARD_LOGICAL_WIDTH = CARD_WIDTH / CARD_SCALE;
export const CARD_LOGICAL_HEIGHT = CARD_HEIGHT / CARD_SCALE;

const W = CARD_LOGICAL_WIDTH;
const H = CARD_LOGICAL_HEIGHT;
const P = palettes.dark;

export interface SotdCardProps {
  data: SotdCardData;
}

export function SotdCard({ data }: SotdCardProps) {
  const tint = colorForFamily(data.family, P);
  const initial = (data.house || data.name).charAt(0).toUpperCase();

  return (
    <View testID="sotd-card" style={styles.card} collapsable={false}>
      <View style={styles.photoWell}>
        {data.photoUrl ? (
          <Image source={{ uri: data.photoUrl }} style={styles.photo} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[`${tint}66`, `${tint}14`, P.bg]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.photo}
          >
            <View style={styles.monogramWrap}>
              <Text style={[styles.monogram, { color: tint }]}>{initial}</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(11, 10, 12, 0.35)', P.bg]}
          locations={[0, 0.55, 1]}
          style={styles.fade}
        />
      </View>

      <View style={styles.copy}>
        <Text variant="overline" style={styles.eyebrow}>
          Scent of the Day
        </Text>
        <Text variant="title" numberOfLines={2} style={styles.name}>
          {data.name}
        </Text>
        {data.house ? (
          <Text variant="small" numberOfLines={1} style={styles.house}>
            {data.house}
          </Text>
        ) : null}
        {data.detail ? (
          <Text variant="caption" numberOfLines={1} style={styles.detail}>
            {data.detail}
          </Text>
        ) : null}
      </View>

      <View testID="sotd-card-mark" style={styles.foot}>
        <View style={[styles.mark, { backgroundColor: P.accent }]} />
        <Text variant="caption" style={styles.wordmark}>
          ScentKeep
        </Text>
      </View>
    </View>
  );
}

const PAD = 28;
const PHOTO_H = 292;

const styles = StyleSheet.create({
  card: {
    width: W,
    height: H,
    backgroundColor: P.bg,
    overflow: 'hidden',
  },
  photoWell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PHOTO_H,
    backgroundColor: P.surface,
  },
  photo: { width: '100%', height: '100%' },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  monogramWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  monogram: { fontSize: 96, lineHeight: 110, fontWeight: '300', opacity: 0.9 },
  copy: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: 52,
    gap: 4,
  },
  eyebrow: { color: P.accent },
  name: { color: P.ink, marginTop: 2 },
  house: { color: P.ink2 },
  detail: { color: P.ink3, marginTop: 2 },
  foot: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  mark: { width: 10, height: 14, borderRadius: 3 },
  wordmark: { color: P.ink2, letterSpacing: 1.2 },
});