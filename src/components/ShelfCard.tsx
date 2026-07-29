import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { ShelfCardData } from '@/domain/shelfCard';
import { colorForFamily, palettes, radius, space } from '@/theme';

// ---------------------------------------------------------------------------
// The image people actually post.
//
// Two decisions worth defending:
//
// 1. It is ALWAYS drawn in the dark palette, whatever theme the user is in. The
//    card leaves the app and lands in someone else's feed, where it has to look
//    like ScentKeep rather than like a screenshot of a setting. Reading the live
//    theme here would produce two different brands depending on a preference the
//    viewer cannot see.
//
// 2. Fixed logical dimensions, not flex. It is captured to a bitmap at a known
//    aspect ratio; a layout that depends on the device width would crop
//    differently on every phone, and the one thing a share card cannot do is
//    render differently for different people.
// ---------------------------------------------------------------------------

/** 4:5 — the tallest crop Instagram will show in full, and it survives being
 *  reposted to Reddit and Discord without letterboxing. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Rendered at a third scale and captured at 3x, so text stays crisp without
 *  laying out a 1080pt-wide view on a 390pt-wide screen. */
export const CARD_SCALE = 3;

/** The card's size in layout points. Exported because any container showing it
 *  must be given this height explicitly — a horizontal ScrollView nested inside
 *  a vertical one collapses to a fraction of its content and silently crops the
 *  bottom of the card, wordmark and all. */
export const CARD_LOGICAL_WIDTH = CARD_WIDTH / CARD_SCALE;
export const CARD_LOGICAL_HEIGHT = CARD_HEIGHT / CARD_SCALE;

const W = CARD_LOGICAL_WIDTH;
const H = CARD_LOGICAL_HEIGHT;

const P = palettes.dark;

export interface ShelfCardProps {
  data: ShelfCardData;
}

export function ShelfCard({ data }: ShelfCardProps) {
  return (
    <View testID="shelf-card" style={styles.card} collapsable={false}>
      <View style={styles.head}>
        <Text variant="overline" style={styles.eyebrow}>
          {data.title}
        </Text>
        <Text variant="title" style={styles.heading}>
          My Wardrobe
        </Text>
        <Text variant="small" style={styles.stat}>
          {data.stat}
        </Text>
      </View>

      <View style={styles.grid}>
        {data.entries.map(({ fragrance, caption }) => {
          const tint = colorForFamily(fragrance.family, P);
          return (
            <View key={fragrance.id} style={styles.cell}>
              <View style={[styles.thumb, { borderColor: P.line }]}>
                {fragrance.photoUrl ? (
                  <Image source={{ uri: fragrance.photoUrl }} style={styles.thumbImage} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={[`${tint}55`, `${tint}12`]}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.thumbImage}
                  >
                    <View style={styles.monogramWrap}>
                      <Text style={[styles.monogram, { color: tint }]}>
                        {(fragrance.brand || fragrance.name).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  </LinearGradient>
                )}
              </View>
              <Text variant="caption" numberOfLines={1} style={styles.name}>
                {fragrance.name}
              </Text>
              {caption ? (
                <Text variant="caption" numberOfLines={1} style={styles.caption}>
                  {caption}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* The only branding on the card. A watermark is the entire point of
          making this shareable, but it goes at the bottom in the quiet colour
          rather than across the middle — a card people are embarrassed to post
          drives no installs at all. */}
      <View testID="shelf-card-mark" style={styles.foot}>
        <View style={[styles.mark, { backgroundColor: P.accent }]} />
        <Text variant="caption" style={styles.wordmark}>
          ScentKeep
        </Text>
      </View>
    </View>
  );
}

// --- the height budget -------------------------------------------------------
// The card is a FIXED 4:5 frame, so its contents have to fit inside it. They
// did not on the first attempt: 3x2 portrait thumbnails plus a header came to
// ~496pt in a 450pt card, and the wordmark quietly fell off the bottom of every
// exported image. The frame won that argument, so the tiles are square and the
// gutters are tight. Roughly, at W=360 / H=450:
//
//   padding      36 + 28                        =  64
//   header       overline + title + stat        =  80
//   grid         2 rows x (93 tile + 38 text)   = 274
//   wordmark                                    =  16
//                                                 ---
//                                                 434, leaving ~16 of slack
//
// Anything added here has to come out of that slack. Check it against the
// exported image, not the on-screen preview — the E2E asserts the wordmark sits
// inside the card's bounds precisely because innerText still reported it as
// present while it was being clipped.
const PAD_H = 28;
const PAD_TOP = 36;
const PAD_BOTTOM = 28;
const GUTTER = space.md;
const CELL_W = (W - PAD_H * 2 - GUTTER * 2) / 3;

const styles = StyleSheet.create({
  card: {
    width: W,
    height: H,
    backgroundColor: P.bg,
    paddingHorizontal: PAD_H,
    paddingTop: PAD_TOP,
    paddingBottom: PAD_BOTTOM,
    justifyContent: 'space-between',
    // Guarantees the exported bitmap is exactly the frame, with nothing bleeding
    // past its edges into the capture.
    overflow: 'hidden',
  },
  head: { gap: 5 },
  eyebrow: { color: P.accent },
  heading: { color: P.ink },
  stat: { color: P.ink3 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
    justifyContent: 'flex-start',
  },
  cell: { width: CELL_W, gap: 3 },
  thumb: {
    width: CELL_W,
    height: CELL_W,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: P.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  monogramWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  monogram: { fontSize: 34, lineHeight: 42, fontWeight: '300', opacity: 0.85 },
  name: { color: P.ink },
  caption: { color: P.ink3 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: { width: 10, height: 14, borderRadius: 3 },
  wordmark: { color: P.ink2, letterSpacing: 1.2 },
});
