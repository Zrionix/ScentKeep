import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BottleLevelBar } from '@/components/BottleLevelBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberField } from '@/components/ui/Field';
import { Rating } from '@/components/ui/Rating';
import { Divider, EmptyState, Screen, SectionHeader } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { bottleLevel, projectRunOut } from '@/domain/bottleLevel';
import { isFeatureUnlocked } from '@/domain/entitlements';
import { alreadyLogged } from '@/domain/sotd';
import { wearCounts } from '@/domain/stats';
import { ITEM_TYPE_LABELS } from '@/domain/types';
import { analytics } from '@/lib/analytics';
import { goBack } from '@/lib/nav';
import { friendlyDate, relativeSpan, todayIso } from '@/lib/dates';
import { useStore } from '@/state/store';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export default function BottleDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const isPremium = useStore((s) => s.isPremium);
  const deleteFragrance = useStore((s) => s.deleteFragrance);
  const moveToWardrobe = useStore((s) => s.moveToWardrobe);
  const moveToWishlist = useStore((s) => s.moveToWishlist);
  const setBottleLevel = useStore((s) => s.setBottleLevel);

  const fragrance = fragrances.find((f) => f.id === id);

  const stats = useMemo(() => {
    if (!fragrance) return null;
    return wearCounts(fragrances, sotd).find((w) => w.fragranceId === fragrance.id) ?? null;
  }, [fragrance, fragrances, sotd]);

  const history = useMemo(
    () => sotd.filter((e) => e.fragranceId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [sotd, id],
  );

  const level = useMemo(() => (fragrance ? bottleLevel(fragrance, sotd) : null), [fragrance, sotd]);
  const projection = useMemo(
    () => (fragrance ? projectRunOut(fragrance, sotd) : null),
    [fragrance, sotd],
  );

  // An inline editor rather than Alert.prompt, which exists only on iOS and
  // would have left Android users unable to correct a level at all.
  const [adjusting, setAdjusting] = React.useState(false);
  const [draftMl, setDraftMl] = React.useState<number | null>(null);

  if (!fragrance) {
    return (
      <Screen testID="bottle-missing">
        <EmptyState
          glyph="⌀"
          title="Bottle not found"
          body="It may have been removed from your collection."
          actionLabel="Back to wardrobe"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const tint = colorForFamily(fragrance.family, colors);
  const loggedToday = alreadyLogged(sotd, fragrance.id, todayIso());

  const confirmDelete = () =>
    Alert.alert(
      `Remove ${fragrance.name}?`,
      'This also removes its entries from your diary. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteFragrance(fragrance.id);
            analytics().capture('bottle_deleted', { in_wishlist: fragrance.inWishlist });
            goBack(router);
          },
        },
      ],
    );

  const promote = () => {
    const result = moveToWardrobe(fragrance.id);
    if (!result.ok) {
      analytics().capture('free_cap_hit', { cap: 'wardrobe' });
      router.push({ pathname: '/paywall', params: { source: 'move-to-wardrobe' } });
      return;
    }
    analytics().capture('wishlist_moved_to_wardrobe', {});
  };

  return (
    <Screen testID="bottle-detail" bottomInset={20}>
      <View style={[styles.hero, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        {fragrance.photoUrl ? (
          <Image source={{ uri: fragrance.photoUrl }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[`${tint}40`, `${tint}0A`]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.heroImage}
          >
            <View style={styles.heroMonogramWrap}>
              <Text style={[styles.heroMonogram, { color: tint }]}>
                {(fragrance.brand || fragrance.name).charAt(0).toUpperCase()}
              </Text>
            </View>
          </LinearGradient>
        )}
      </View>

      <View style={styles.titleBlock}>
        {fragrance.inWishlist ? (
          <Text variant="overline" tone="accent">
            On the wishlist
          </Text>
        ) : null}
        <Text variant="title" accessibilityRole="header">
          {fragrance.name}
        </Text>
        <Text variant="body" tone="tertiary">
          {fragrance.brand || 'Unknown house'}
        </Text>
      </View>

      <TagRow>
        {fragrance.family ? <Tag label={fragrance.family} family /> : null}
        {fragrance.concentration ? <Tag label={fragrance.concentration} /> : null}
        {fragrance.type !== 'bottle' ? <Tag label={ITEM_TYPE_LABELS[fragrance.type]} /> : null}
        {fragrance.houseTier ? <Tag label={fragrance.houseTier} /> : null}
        {fragrance.sizeMl ? <Tag label={`${fragrance.sizeMl} ml`} /> : null}
        {fragrance.price !== null ? (
          <Tag label={`${fragrance.currency} ${fragrance.price.toFixed(2)}`} />
        ) : null}
      </TagRow>

      {!fragrance.inWishlist ? (
        <Button
          testID="detail-log-sotd"
          label={loggedToday ? 'Logged today' : 'Wear this today'}
          onPress={() =>
            router.push({ pathname: '/log-sotd', params: { from: 'bottle', fragranceId: fragrance.id } })
          }
          disabled={loggedToday}
          size="lg"
          fullWidth
          style={styles.primaryAction}
        />
      ) : (
        <Button
          testID="detail-promote"
          label="I bought it — move to wardrobe"
          onPress={promote}
          size="lg"
          fullWidth
          style={styles.primaryAction}
        />
      )}

      {!fragrance.inWishlist ? (
        <View style={styles.statRow}>
          <Card flat style={styles.miniStat}>
            <Text variant="overline" tone="tertiary">
              Wears
            </Text>
            <Text variant="heading">{stats?.wears ?? 0}</Text>
          </Card>
          <Card flat style={styles.miniStat}>
            <Text variant="overline" tone="tertiary">
              Last worn
            </Text>
            <Text variant="small" style={styles.miniStatValue}>
              {relativeSpan(stats?.lastWorn ?? null)}
            </Text>
          </Card>
          <Card flat style={styles.miniStat}>
            {/* "Cost / wear" wrapped to two lines at this width and pushed the
                third card taller than the other two. */}
            <Text variant="overline" tone="tertiary" numberOfLines={1}>
              Per wear
            </Text>
            <Text variant="small" style={styles.miniStatValue}>
              {stats?.costPerWear !== null && stats?.costPerWear !== undefined
                ? `${fragrance.currency} ${stats.costPerWear.toFixed(2)}`
                : '—'}
            </Text>
          </Card>
        </View>
      ) : null}

      {level ? (
        <>
          <SectionHeader title="What's left" />
          {isFeatureUnlocked('bottle-levels', isPremium) ? (
            <Card testID="bottle-level">
              <BottleLevelBar
                level={level}
                projection={projection}
                sizeMl={fragrance.sizeMl!}
                spraysPerWear={fragrance.spraysPerWear}
                onAdjust={() => {
                  setDraftMl(level.remainingMl);
                  setAdjusting((v) => !v);
                }}
              />

              {adjusting ? (
                <View style={styles.adjustBlock} testID="level-adjust">
                  <NumberField
                    label="Millilitres left"
                    testID="level-input"
                    value={draftMl}
                    onChangeNumber={setDraftMl}
                    hint={`Out of ${fragrance.sizeMl} ml. Wears are counted from here on.`}
                  />
                  <View style={styles.adjustActions}>
                    <Button
                      testID="level-save"
                      label="Save level"
                      onPress={() => {
                        setBottleLevel(fragrance.id, draftMl);
                        setAdjusting(false);
                      }}
                      style={styles.fill}
                    />
                    <Button
                      testID="level-reset"
                      label="Back to estimate"
                      variant="secondary"
                      onPress={() => {
                        setBottleLevel(fragrance.id, null);
                        setAdjusting(false);
                      }}
                      style={styles.fill}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          ) : (
            <Card
              testID="bottle-level-locked"
              flat
              onPress={() => {
                analytics().capture('free_cap_hit', { cap: 'bottle-levels' });
                router.push({ pathname: '/paywall', params: { source: 'bottle-level' } });
              }}
              accessibilityLabel="Bottle level tracking is a Premium feature. Tap to see Premium."
              style={[styles.lockedCard, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
            >
              <Text variant="overline" tone="accent">
                Premium
              </Text>
              <Text variant="small" tone="secondary" style={styles.lockedBody}>
                See how much is left in this bottle, and get a nudge before it runs dry.
              </Text>
            </Card>
          )}
        </>
      ) : null}

      {fragrance.notesTop || fragrance.notesHeart || fragrance.notesBase ? (
        <>
          <SectionHeader title="Notes" />
          <Card>
            {[
              { label: 'Top', value: fragrance.notesTop },
              { label: 'Heart', value: fragrance.notesHeart },
              { label: 'Base', value: fragrance.notesBase },
            ]
              .filter((n) => n.value)
              .map((n, i, arr) => (
                <View key={n.label}>
                  <Text variant="overline" tone="accent">
                    {n.label}
                  </Text>
                  <Text variant="body" tone="secondary" style={styles.noteValue}>
                    {n.value}
                  </Text>
                  {i < arr.length - 1 ? <Divider style={styles.noteDivider} /> : null}
                </View>
              ))}
          </Card>
        </>
      ) : null}

      {fragrance.seasons.length || fragrance.occasions.length ? (
        <>
          <SectionHeader title="When you wear it" />
          <TagRow>
            {fragrance.seasons.map((s) => (
              <Tag key={s} label={s} />
            ))}
            {fragrance.occasions.map((o) => (
              <Tag key={o} label={o} />
            ))}
          </TagRow>
        </>
      ) : null}

      <SectionHeader title="Performance" />
      <Card>
        <View style={styles.ratings}>
          <Rating label="Overall" value={fragrance.rating} size={20} />
          <Rating label="Longevity" value={fragrance.longevity} size={20} />
          <Rating label="Sillage" value={fragrance.sillage} size={20} />
        </View>
      </Card>

      {fragrance.notes ? (
        <>
          <SectionHeader title="Your notes" />
          <Card>
            <Text variant="body" tone="secondary">
              {fragrance.notes}
            </Text>
          </Card>
        </>
      ) : null}

      {history.length > 0 ? (
        <>
          <SectionHeader title={`Wear history (${history.length})`} />
          <Card padded={false}>
            {(isPremium ? history : history.slice(0, 10)).map((e, i) => (
              <View
                key={e.id}
                style={[
                  styles.historyRow,
                  i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
                ]}
              >
                <Text variant="small">{friendlyDate(e.date)}</Text>
                <Text variant="caption" tone="tertiary">
                  {[e.occasion, e.weather, e.mood].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
            ))}
            {!isPremium && history.length > 10 ? (
              <View style={styles.historyRow}>
                <Text variant="caption" tone="faint">
                  {history.length - 10} older wears — Premium shows them all
                </Text>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Divider style={styles.actionsDivider} />

      <Button
        testID="detail-edit"
        label="Edit bottle"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: '/bottle/new', params: { id: fragrance.id } })}
      />

      {!fragrance.inWishlist ? (
        <Button
          testID="detail-demote"
          label="Move to wishlist"
          variant="ghost"
          fullWidth
          style={styles.secondaryAction}
          onPress={() => {
            const result = moveToWishlist(fragrance.id);
            if (!result.ok) {
              analytics().capture('free_cap_hit', { cap: 'wishlist' });
              router.push({ pathname: '/paywall', params: { source: 'move-to-wishlist' } });
            }
          }}
        />
      ) : null}

      <Button
        testID="detail-delete"
        label="Remove from collection"
        variant="danger"
        fullWidth
        style={styles.secondaryAction}
        onPress={confirmDelete}
      />

      <Button label="Back" variant="ghost" fullWidth style={styles.secondaryAction} onPress={() => goBack(router)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 280,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: space.xl,
  },
  heroImage: { width: '100%', height: '100%' },
  heroMonogramWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroMonogram: { fontSize: 84, lineHeight: 100, fontWeight: '300', opacity: 0.8 },
  titleBlock: { marginBottom: space.lg, gap: 3 },
  primaryAction: { marginTop: space.xl },
  statRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, alignItems: 'stretch' },
  miniStat: { flex: 1, minHeight: 76, justifyContent: 'flex-start' },
  miniStatValue: { marginTop: 4 },
  noteValue: { marginTop: 4 },
  noteDivider: { marginVertical: space.md },
  ratings: { gap: space.lg },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  actionsDivider: { marginTop: space.xxl },
  secondaryAction: { marginTop: space.sm },
  adjustBlock: { marginTop: space.xl },
  adjustActions: { flexDirection: 'row', gap: space.sm },
  fill: { flex: 1 },
  lockedCard: { borderWidth: 1 },
  lockedBody: { marginTop: 4 },
});
