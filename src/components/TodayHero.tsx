import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { Fragrance, SotdEntry } from '@/domain/types';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export interface TodayWear {
  entry: SotdEntry;
  fragrance: Fragrance | undefined;
}

export type TodayHeroKind = 'empty' | 'prompt' | 'logged';

/** Empty shelf never offers Wear this, Today's pick, Rediscover, or share. */
export function todayHeroKind(ownedCount: number, loggedToday: boolean): TodayHeroKind {
  if (ownedCount <= 0) return 'empty';
  return loggedToday ? 'logged' : 'prompt';
}

export interface TodayHeroProps {
  loggedToday: boolean;
  wears: TodayWear[];
  onLogPress: () => void;
  onOpenBottle: (id: string) => void;
  /** Opens a no-price card of the bottle on skin. */
  onShare?: (fragranceId: string) => void;
}

/**
 * The daily moment at the top of Home.
 *
 * Unlogged: one card, one job — get today's scent into the diary.
 * Logged: show what is on skin, quietly, with room to add another.
 * Optional details stay on the log screen; this is the glance.
 */
export function TodayHero({ loggedToday, wears, onLogPress, onOpenBottle, onShare }: TodayHeroProps) {
  const { colors } = useTheme();

  if (loggedToday && wears.length > 0) {
    return (
      <Card
        testID="sotd-logged"
        style={[styles.card, { borderColor: colors.line }]}
        accessibilityLabel={`Wearing today: ${wears
          .map((w) => w.fragrance?.name ?? 'a bottle')
          .join(', ')}. Tap a bottle to open it.`}
      >
        <View style={styles.loggedHead}>
          <View style={styles.fill}>
            <Text variant="overline" tone="tertiary">
              Wearing today
            </Text>
          </View>
          <Pressable
            testID="sotd-prompt"
            onPress={onLogPress}
            accessibilityRole="button"
            accessibilityLabel="Log another bottle for today"
            hitSlop={10}
            style={({ pressed }) => [styles.addAnother, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text variant="caption" tone="accent">
              + another
            </Text>
          </Pressable>
        </View>

        <View style={styles.wears}>
          {wears.map((w) => (
            <Pressable
              key={w.entry.id}
              testID={`today-wear-${w.entry.id}`}
              onPress={() => (w.fragrance ? onOpenBottle(w.fragrance.id) : undefined)}
              accessibilityRole="button"
              accessibilityLabel={w.fragrance ? `${w.fragrance.name} by ${w.fragrance.brand || 'unknown house'}` : 'Removed bottle'}
              style={({ pressed }) => [styles.wearRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View
                style={[styles.swatch, { backgroundColor: colorForFamily(w.fragrance?.family, colors) }]}
              />
              <View style={styles.fill}>
                <Text variant="title" numberOfLines={2}>
                  {w.fragrance?.name ?? 'Removed bottle'}
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {[w.fragrance?.brand, w.entry.occasion, w.entry.weather].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <Text tone="faint">›</Text>
            </Pressable>
          ))}
        </View>
        {onShare && wears.some((w) => w.fragrance) ? (
          <Pressable
            testID="sotd-share"
            onPress={() => {
              const id = wears.find((w) => w.fragrance)?.fragrance?.id;
              if (id) onShare(id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Share a card of today's scent. No prices, no dates, no diary."
            hitSlop={8}
            style={({ pressed }) => [styles.shareRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text variant="caption" tone="accent">
              Share today's scent
            </Text>
          </Pressable>
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      onPress={onLogPress}
      testID="sotd-prompt"
      accessibilityLabel="Log your scent of the day"
      style={[styles.card, styles.unlogged, { borderColor: colors.accentLine }]}
    >
      <View style={styles.sotdRow}>
        <View style={styles.fill}>
          <Text variant="overline" tone="accent">
            Scent of the Day
          </Text>
          <Text variant="title" style={styles.sotdTitle}>
            What are you wearing today?
          </Text>
          <Text variant="small" tone="tertiary" style={styles.sotdBody}>
            One tap. Occasion and a note can wait.
          </Text>
        </View>
        <View style={[styles.sotdChevron, { backgroundColor: colors.accent }]}>
          <Text tone="onAccent" style={styles.sotdChevronText}>
            ›
          </Text>
        </View>
      </View>
    </Card>
  );
}

export interface ReminderAskProps {
  time: string;
  onYes: () => void;
  onNo: () => void;
}

export interface EmptyTodayHeroProps {
  onAddBottle: () => void;
  /** Count of wishes already on the list. Zero hides the secondary tap. */
  wishlistCount?: number;
  onAddFromWishlist?: () => void;
}

/**
 * First-open Today. One tap to add a real bottle. No demo shelf, no account
 * wall, no paywall. Wear this / SOTD / share stay hidden until there is
 * something to wear.
 */
export function EmptyTodayHero({
  onAddBottle,
  wishlistCount = 0,
  onAddFromWishlist,
}: EmptyTodayHeroProps) {
  const { colors } = useTheme();
  const showWishlist = wishlistCount > 0 && Boolean(onAddFromWishlist);

  return (
    <View testID="today-empty">
      <Card
        onPress={onAddBottle}
        testID="today-empty-add"
        accessibilityLabel="Add your first bottle to start Today"
        style={[styles.card, styles.unlogged, { borderColor: colors.accentLine }]}
      >
        <View style={styles.sotdRow}>
          <View style={styles.fill}>
            <Text variant="overline" tone="accent">
              First bottle
            </Text>
            <Text variant="title" style={styles.sotdTitle}>
              Add a bottle to start Today
            </Text>
            <Text variant="small" tone="tertiary" style={styles.sotdBody}>
              Scent of the Day waits until something is on the shelf. Nothing is added for you.
            </Text>
          </View>
          <View style={[styles.sotdChevron, { backgroundColor: colors.accent }]}>
            <Text tone="onAccent" style={styles.sotdChevronText}>
              ›
            </Text>
          </View>
        </View>
      </Card>
      {showWishlist ? (
        <Pressable
          testID="today-empty-wishlist"
          onPress={onAddFromWishlist}
          accessibilityRole="button"
          accessibilityLabel={
            wishlistCount === 1
              ? 'Add your wish to the shelf'
              : 'Add a bottle from the wishlist'
          }
          hitSlop={8}
          style={({ pressed }) => [styles.emptyWish, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text variant="caption" tone="accent">
            Add from the wishlist
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Offered once, after a log, never as a gate. Dismissing it loses nothing. */
export function ReminderAsk({ time, onYes, onNo }: ReminderAskProps) {
  return (
    <Card testID="home-reminder-ask" flat style={styles.askCard}>
      <Text variant="overline" tone="tertiary">
        Optional
      </Text>
      <Text variant="subtitle" style={styles.askTitle}>
        Want a nudge tomorrow?
      </Text>
      <Text variant="small" tone="secondary" style={styles.askBody}>
        A quiet reminder at {time} to log what you are wearing. No streaks to lose — just the nudge. You
        can change the time or turn this off in Settings.
      </Text>
      <View style={styles.askActions}>
        <Button testID="reminder-yes" label="Yes, remind me" onPress={onYes} size="sm" />
        <Button testID="reminder-no" label="Not now" variant="ghost" onPress={onNo} size="sm" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { marginBottom: space.lg, borderWidth: 1 },
  unlogged: {},
  sotdRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sotdTitle: { marginTop: 4 },
  sotdBody: { marginTop: 6 },
  sotdChevron: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sotdChevronText: { fontSize: 20, lineHeight: 24 },
  loggedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  addAnother: { paddingVertical: 2, paddingHorizontal: space.xs },
  wears: { gap: space.md },
  shareRow: { marginTop: space.lg, alignSelf: "flex-start" },
  wearRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: { width: 6, height: 44, borderRadius: 3 },
  askCard: { marginBottom: space.lg },
  askTitle: { marginTop: 4 },
  askBody: { marginTop: space.sm },
  askActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  emptyWish: { marginTop: -space.sm, marginBottom: space.lg, alignSelf: 'flex-start' },
});