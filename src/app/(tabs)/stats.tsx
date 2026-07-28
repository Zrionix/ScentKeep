import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, StatCard } from '@/components/ui/Card';
import { EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { runningLow, totalRemainingMl } from '@/domain/bottleLevel';
import { isFeatureUnlocked } from '@/domain/entitlements';
import { NEGLECTED_AFTER_DAYS, summarise, type Breakdown } from '@/domain/stats';
import { analytics } from '@/lib/analytics';
import { relativeSpan } from '@/lib/dates';
import { useStore } from '@/state/store';
import { colorForFamily, space } from '@/theme';
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
  const low = useMemo(() => runningLow(fragrances, sotd), [fragrances, sotd]);
  const leftMl = useMemo(() => totalRemainingMl(fragrances, sotd), [fragrances, sotd]);

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

function LockedCard({ title, onPress, testID }: { title: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Card
      testID={testID}
      flat
      onPress={onPress}
      accessibilityLabel={`${title}. Premium feature. Tap to see Premium.`}
      style={[styles.lockedCard, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
    >
      <Text variant="overline" tone="accent">
        Premium
      </Text>
      <Text variant="small" tone="secondary" style={styles.lockedTitle}>
        {title}
      </Text>
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
  lockedCard: { borderWidth: 1 },
  lockedTitle: { marginTop: 4 },
});
