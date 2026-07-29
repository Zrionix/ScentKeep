import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, StatCard } from '@/components/ui/Card';
import { LockedCard } from '@/components/ui/LockedCard';
import { EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { runningLow, totalRemainingMl } from '@/domain/bottleLevel';
import { isFeatureUnlocked } from '@/domain/entitlements';
import { layeringPairs } from '@/domain/layering';
import { MIN_BOTTLES_FOR_CARD } from '@/domain/shelfCard';
import { collectionShape, triageWishlist, type Verdict } from '@/domain/similarity';
import { NEGLECTED_AFTER_DAYS, summarise, type Breakdown } from '@/domain/stats';
import { analytics } from '@/lib/analytics';
import { relativeSpan } from '@/lib/dates';
import { useStore } from '@/state/store';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const isPremium = useStore((s) => s.isPremium);
  const currency = useStore((s) => s.settings.currency);

  const s = useMemo(() => summarise(fragrances, sotd, currency), [fragrances, sotd, currency]);
  const advanced = isFeatureUnlocked('advanced-stats', isPremium);
  const discovery = isFeatureUnlocked('discovery', isPremium);
  const low = useMemo(() => runningLow(fragrances, sotd), [fragrances, sotd]);
  const leftMl = useMemo(() => totalRemainingMl(fragrances, sotd), [fragrances, sotd]);

  const shape = useMemo(() => collectionShape(fragrances), [fragrances]);
  const triage = useMemo(() => triageWishlist(fragrances), [fragrances]);
  const pairs = useMemo(() => layeringPairs(fragrances), [fragrances]);

  React.useEffect(() => {
    analytics().capture('stats_viewed', { collection_size: s.bottles, is_premium: isPremium });
  }, [s.bottles, isPremium]);

  const upsell = (from: string) => {
    analytics().capture('free_cap_hit', { cap: 'stats' });
    router.push({ pathname: '/paywall', params: { source: from } });
  };

  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  if (s.bottles === 0) {
    return (
      <Screen testID="stats">
        <PageHeader eyebrow="Collection" title="Insights" />
        <EmptyState
          testID="stats-empty"
          glyph="◧"
          title="Nothing to measure yet"
          body="Add a few bottles and log what you wear — the numbers get interesting fast."
          actionLabel="Add a bottle"
          onAction={() => router.push('/bottle/new')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="stats">
      <PageHeader
        eyebrow="Collection"
        title="Insights"
        subtitle={`${s.bottles} ${s.bottles === 1 ? 'bottle' : 'bottles'} · ${s.totalWears} logged ${
          s.totalWears === 1 ? 'wear' : 'wears'
        }`}
        right={
          s.bottles >= MIN_BOTTLES_FOR_CARD ? (
            <Pressable
              testID="stats-share"
              onPress={() => router.push('/share')}
              accessibilityRole="button"
              accessibilityLabel="Share a card of your collection"
              hitSlop={10}
            >
              <Text variant="caption" tone="accent">
                Share
              </Text>
            </Pressable>
          ) : null
        }
      />

      <View style={styles.grid}>
        <StatCard
          testID="stat-bottles"
          label="Bottles"
          value={String(s.bottles)}
          caption={s.wishlist > 0 ? `+${s.wishlist} on the wishlist` : undefined}
        />
        <StatCard
          testID="stat-value"
          label="Collection value"
          value={s.value.pricedCount > 0 ? money(s.value.total) : '—'}
          // The caveat travels with the number: a value that only covers the
          // priced bottles must never read as if it covers the whole shelf.
          caption={
            s.value.pricedCount === 0
              ? 'Add prices to see this'
              : s.value.unpricedCount > 0
                ? `Based on ${s.value.pricedCount} of ${s.bottles} bottles`
                : `Across all ${s.value.pricedCount} bottles`
          }
        />
      </View>

      <View style={styles.grid}>
        <StatCard
          testID="stat-wears-week"
          label="Wears / week"
          value={s.wearsPerWeek.toFixed(1)}
          caption="Averaged over your diary"
        />
        <StatCard
          testID="stat-volume"
          label="Juice left"
          value={s.volumeMl > 0 ? `${Math.round(leftMl).toLocaleString()} ml` : '—'}
          // Capacity bought vs what is actually left are very different numbers
          // after a year of wearing it; the caption makes clear which this is.
          caption={s.volumeMl > 0 ? `of ${s.volumeMl.toLocaleString()} ml bought` : 'Add bottle sizes'}
        />
      </View>

      <SectionHeader title="Most worn" />
      {s.mostWorn.length === 0 ? (
        <Card flat>
          <Text variant="small" tone="tertiary">
            Log a few days and your rotation shows up here.
          </Text>
        </Card>
      ) : (
        <Card padded={false}>
          {s.mostWorn.map((w, i) => (
            <View
              key={w.fragranceId}
              style={[
                styles.row,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
              ]}
            >
              <Text variant="caption" tone="faint" style={styles.rank}>
                {i + 1}
              </Text>
              <View
                style={[styles.swatch, { backgroundColor: colorForFamily(w.fragrance?.family, colors) }]}
              />
              <View style={styles.fill}>
                <Text variant="subtitle" numberOfLines={1}>
                  {w.fragrance?.name ?? 'Removed bottle'}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {w.fragrance?.brand || '—'}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text variant="subtitle" tone="accent">
                  {w.wears}
                </Text>
                <Text variant="caption" tone="faint">
                  {w.wears === 1 ? 'wear' : 'wears'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {s.bestValue?.fragrance && s.bestValue.costPerWear !== null ? (
        <Card flat style={styles.highlight}>
          <Text variant="overline" tone="accent">
            Best value
          </Text>
          <Text variant="subtitle" style={styles.highlightTitle}>
            {s.bestValue.fragrance.name}
          </Text>
          <Text variant="small" tone="tertiary">
            {currency} {s.bestValue.costPerWear.toFixed(2)} per wear across {s.bestValue.wears} wears
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Running low" />
      {isFeatureUnlocked('bottle-levels', isPremium) ? (
        low.length === 0 ? (
          <Card flat testID="stat-low-empty">
            <Text variant="small" tone="tertiary">
              Nothing is running low. Every bottle with a size recorded still has plenty in it.
            </Text>
          </Card>
        ) : (
          <Card padded={false} testID="stat-low">
            {low.slice(0, 6).map((l, i) => (
              <Pressable
                key={l.fragrance.id}
                testID={`low-${l.fragrance.id}`}
                onPress={() => router.push({ pathname: '/bottle/[id]', params: { id: l.fragrance.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${l.fragrance.name}, about ${Math.round(l.level.fraction * 100)} percent left`}
                style={[
                  styles.row,
                  i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: l.level.isEmpty ? colors.danger : colors.warning },
                  ]}
                />
                <View style={styles.fill}>
                  <Text variant="subtitle" numberOfLines={1}>
                    {l.fragrance.name}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    ~{l.level.remainingMl} ml left
                    {l.projection?.daysLeft !== null && l.projection
                      ? ` · ${l.projection.label.toLowerCase()}`
                      : ''}
                  </Text>
                </View>
                <Text variant="subtitle" tone={l.level.isEmpty ? 'danger' : 'accent'}>
                  {Math.round(l.level.fraction * 100)}%
                </Text>
              </Pressable>
            ))}
          </Card>
        )
      ) : (
        <LockedCard
          testID="stat-low-locked"
          title="Know before a bottle runs dry"
          onPress={() => upsell('stats-running-low')}
        />
      )}

      <SectionHeader title="Rotation" />
      {advanced ? (
        <Card testID="stat-rotation">
          <View style={styles.rotationHead}>
            <Text variant="stat" tone="accent">
              {Math.round(s.rotation.ratio * 100)}%
            </Text>
            <Text variant="small" tone="tertiary" style={styles.fill}>
              of your collection worn in the last {s.rotation.windowDays} days —{' '}
              {s.rotation.distinctWorn} of {s.rotation.owned} bottles.
            </Text>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.surface3 }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: colors.accent, width: `${Math.round(s.rotation.ratio * 100)}%` },
              ]}
            />
          </View>
        </Card>
      ) : (
        <LockedCard
          testID="stat-rotation-locked"
          title="How much of your collection is actually in play"
          onPress={() => upsell('stats-rotation')}
        />
      )}

      <SectionHeader title={`Not worn in ${NEGLECTED_AFTER_DAYS} days`} />
      {advanced ? (
        s.neglected.length === 0 ? (
          <Card flat testID="stat-neglected-empty">
            <Text variant="small" tone="tertiary">
              Nothing neglected — every bottle has had a turn recently.
            </Text>
          </Card>
        ) : (
          <Card padded={false} testID="stat-neglected">
            {s.neglected.slice(0, 6).map((n, i) => (
              <View
                key={n.fragrance.id}
                style={[
                  styles.row,
                  i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
                ]}
              >
                <View
                  style={[styles.swatch, { backgroundColor: colorForFamily(n.fragrance.family, colors) }]}
                />
                <View style={styles.fill}>
                  <Text variant="subtitle" numberOfLines={1}>
                    {n.fragrance.name}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {n.fragrance.brand || '—'}
                  </Text>
                </View>
                <Text variant="caption" tone={n.lastWorn === null ? 'danger' : 'tertiary'}>
                  {relativeSpan(n.lastWorn)}
                </Text>
              </View>
            ))}
          </Card>
        )
      ) : (
        <LockedCard
          testID="stat-neglected-locked"
          title="The bottles quietly gathering dust"
          onPress={() => upsell('stats-neglected')}
        />
      )}

      <SectionHeader title="The shape of your shelf" />
      {discovery ? (
        <CollectionShapeCard shape={shape} bottles={s.bottles} />
      ) : (
        <LockedCard
          testID="stat-shape-locked"
          title="Where your collection is concentrated, and where it isn't"
          body="Worked out from the families you've tagged. Nothing leaves your device."
          onPress={() => {
            analytics().capture('free_cap_hit', { cap: 'discovery' });
            router.push({ pathname: '/paywall', params: { source: 'stats-shape' } });
          }}
        />
      )}

      {triage.length > 0 ? (
        <>
          <SectionHeader title="Is your wishlist worth it?" />
          {discovery ? (
            <Card padded={false} testID="stat-triage">
              {triage.slice(0, 6).map((t, i) => (
                <Pressable
                  key={t.fragrance.id}
                  testID={`triage-${t.fragrance.id}`}
                  onPress={() => router.push({ pathname: '/bottle/[id]', params: { id: t.fragrance.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.fragrance.name}. ${VERDICT_LABEL[t.verdict]}.`}
                  style={[
                    styles.triageRow,
                    i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
                  ]}
                >
                  <View style={styles.fill}>
                    <Text variant="subtitle" numberOfLines={1}>
                      {t.fragrance.name}
                    </Text>
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {t.closest
                        ? `Closest to ${t.closest.fragrance.name}`
                        : t.fillsGap
                          ? `Your first ${String(t.fragrance.family).toLowerCase()}`
                          : 'Not enough entered to compare'}
                    </Text>
                  </View>
                  <VerdictPill verdict={t.verdict} />
                </Pressable>
              ))}
            </Card>
          ) : (
            <LockedCard
              testID="stat-triage-locked"
              title="Which of these you already own something like"
              onPress={() => {
                analytics().capture('free_cap_hit', { cap: 'discovery' });
                router.push({ pathname: '/paywall', params: { source: 'stats-triage' } });
              }}
            />
          )}
        </>
      ) : null}

      {s.bottles >= 2 ? (
        <>
          <SectionHeader title="Worth layering" />
          {discovery ? (
            pairs.length === 0 ? (
              <Card flat testID="stat-pairs-empty">
                <Text variant="small" tone="tertiary">
                  Nothing on the shelf pairs obviously yet. Add note pyramids and families and the
                  suggestions get much better.
                </Text>
              </Card>
            ) : (
              <Card padded={false} testID="stat-pairs">
                {pairs.map((p, i) => (
                  <View
                    key={`${p.anchor.id}-${p.lift.id}`}
                    style={[
                      styles.pairRow,
                      i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
                    ]}
                  >
                    <View style={styles.pairNames}>
                      <Text variant="subtitle" numberOfLines={1} style={styles.fill}>
                        {p.anchor.name}
                      </Text>
                      <Text variant="caption" tone="accent">
                        under
                      </Text>
                      <Text variant="subtitle" numberOfLines={1} style={styles.fill}>
                        {p.lift.name}
                      </Text>
                    </View>
                    <Text variant="caption" tone="tertiary" style={styles.pairReason}>
                      {p.reasons[0]}
                    </Text>
                  </View>
                ))}
              </Card>
            )
          ) : (
            <LockedCard
              testID="stat-pairs-locked"
              title="Which two of yours work together"
              onPress={() => {
                analytics().capture('free_cap_hit', { cap: 'discovery' });
                router.push({ pathname: '/paywall', params: { source: 'stats-layering' } });
              }}
            />
          )}
        </>
      ) : null}

      <SectionHeader title="By family" />
      {advanced ? (
        <BreakdownBars data={s.families} testID="stat-families" colored />
      ) : (
        <LockedCard
          testID="stat-families-locked"
          title="What your collection is actually made of"
          onPress={() => upsell('stats-families')}
        />
      )}

      <SectionHeader title="By season" />
      {advanced ? (
        <BreakdownBars data={s.seasons} testID="stat-seasons" />
      ) : (
        <LockedCard
          testID="stat-seasons-locked"
          title="Where your wardrobe is thin"
          onPress={() => upsell('stats-seasons')}
        />
      )}

      {/* Free too: these are simple counts of what the user typed in, and
          they're what makes the app feel like it understands collecting. */}
      {s.types.length > 1 ? (
        <>
          <SectionHeader title="Bottles, decants & samples" />
          <BreakdownBars data={s.types} testID="stat-types" />
        </>
      ) : null}

      {s.concentrations.length > 0 ? (
        <>
          <SectionHeader title="By concentration" />
          <BreakdownBars data={s.concentrations} testID="stat-concentrations" />
        </>
      ) : null}

      {s.houseTiers.length > 0 ? (
        <>
          <SectionHeader title="Designer vs niche" />
          <BreakdownBars data={s.houseTiers} testID="stat-tiers" />
        </>
      ) : null}
    </Screen>
  );
}

function BreakdownBars({
  data,
  testID,
  colored,
}: {
  data: Breakdown[];
  testID: string;
  colored?: boolean;
}) {
  const { colors } = useTheme();
  if (data.length === 0) {
    return (
      <Card flat testID={`${testID}-empty`}>
        <Text variant="small" tone="tertiary">
          Tag your bottles and the breakdown appears here.
        </Text>
      </Card>
    );
  }
  const max = Math.max(...data.map((d) => d.count));
  return (
    <Card testID={testID}>
      <View style={styles.bars}>
        {data.map((d) => (
          <View key={d.label}>
            <View style={styles.barRow}>
              <Text variant="small" tone="secondary" style={styles.fill} numberOfLines={1}>
                {d.label}
              </Text>
              <Text variant="caption" tone="tertiary">
                {d.count} · {Math.round(d.share * 100)}%
              </Text>
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surface3 }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: colored ? colorForFamily(d.label, colors) : colors.accent,
                    width: `${Math.max(4, Math.round((d.count / max) * 100))}%`,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const VERDICT_LABEL: Record<Verdict, string> = {
  duplicate: 'Have one',
  similar: 'Similar',
  'new-ground': 'New ground',
  unknown: 'Unknown',
};

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const { colors } = useTheme();
  // "Unknown" is deliberately the same neutral grey as a missing value
  // elsewhere: it means the app has nothing to go on, not that the bottle is a
  // bad idea, and colouring it like a warning would say the wrong thing.
  const tone =
    verdict === 'new-ground'
      ? { fg: colors.positive, bg: colors.positiveBg, line: colors.positive }
      : verdict === 'duplicate'
        ? { fg: colors.warning, bg: colors.warningBg, line: colors.warning }
        : verdict === 'similar'
          ? { fg: colors.ink2, bg: colors.surface2, line: colors.line }
          : { fg: colors.ink4, bg: colors.surface2, line: colors.line };

  return (
    <View style={[styles.verdictPill, { backgroundColor: tone.bg, borderColor: tone.line }]}>
      <Text variant="caption" style={{ color: tone.fg }}>
        {VERDICT_LABEL[verdict]}
      </Text>
    </View>
  );
}

/**
 * What the shelf is made of, in words.
 *
 * Deliberately prose rather than another bar chart — "By family" two sections
 * down already draws the distribution. What this adds is the reading of it, and
 * it says out loud how many bottles it had to ignore, the same way collection
 * value does.
 */
function CollectionShapeCard({ shape, bottles }: { shape: ReturnType<typeof collectionShape>; bottles: number }) {
  if (shape.tooSparse) {
    return (
      <Card flat testID="stat-shape-sparse">
        <Text variant="small" tone="tertiary">
          Tag a few more bottles with a family and this starts to mean something. Right now{' '}
          {shape.classified} of {bottles} {shape.classified === 1 ? 'has' : 'have'} one.
        </Text>
      </Card>
    );
  }

  const top = shape.concentrations[0];
  const missing = shape.missing.slice(0, 4);

  return (
    <Card testID="stat-shape">
      {top ? (
        <Text variant="body" tone="secondary">
          <Text variant="body" tone="accent">
            {Math.round(top.share * 100)}%
          </Text>{' '}
          of the bottles you have classified are {top.family.toLowerCase()}.
        </Text>
      ) : (
        <Text variant="body" tone="secondary">
          Your collection is evenly spread — no single family dominates it.
        </Text>
      )}

      {missing.length > 0 ? (
        <Text variant="small" tone="tertiary" style={styles.shapeBody}>
          You own nothing in {missing.slice(0, -1).join(', ')}
          {missing.length > 1 ? ' or ' : ''}
          {missing[missing.length - 1]}
          {shape.missing.length > missing.length ? `, and ${shape.missing.length - missing.length} more` : ''}.
        </Text>
      ) : (
        <Text variant="small" tone="tertiary" style={styles.shapeBody}>
          You have at least one bottle in every family ScentKeep knows about.
        </Text>
      )}

      {shape.unclassified > 0 ? (
        <Text variant="caption" tone="faint" style={styles.shapeBody}>
          Based on {shape.classified} of {bottles} bottles — the other {shape.unclassified} have no
          family set.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rank: { width: 14 },
  swatch: { width: 5, height: 36, borderRadius: 3 },
  rowRight: { alignItems: 'flex-end' },
  highlight: { marginTop: space.md },
  highlightTitle: { marginTop: 4 },
  rotationHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.lg },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  bars: { gap: space.lg },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 6 },
  shapeBody: { marginTop: space.sm },
  triageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  verdictPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pairReason: { marginTop: 4 },
  pairRow: { padding: space.lg },
  pairNames: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
