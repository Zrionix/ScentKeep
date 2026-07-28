import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { currentStreak, daysLogged, groupByDay, hiddenHistoryCount, longestStreak, visibleHistory } from '@/domain/sotd';
import { analytics } from '@/lib/analytics';
import { friendlyDate, recentDates } from '@/lib/dates';
import { useStore } from '@/state/store';
import { colorForFamily, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export default function DiaryScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const isPremium = useStore((s) => s.isPremium);

  const visible = useMemo(() => visibleHistory(sotd, isPremium), [sotd, isPremium]);
  const days = useMemo(() => groupByDay(visible), [visible]);
  const hidden = useMemo(() => hiddenHistoryCount(sotd, isPremium), [sotd, isPremium]);

  const streak = currentStreak(sotd);
  const best = longestStreak(sotd);
  const logged = daysLogged(sotd);

  const byId = useMemo(() => new Map(fragrances.map((f) => [f.id, f])), [fragrances]);

  // 8 weeks of dots. Enough to see a rhythm without becoming a wall.
  const heatmapDates = useMemo(() => recentDates(56), []);
  const loggedDates = useMemo(() => new Set(sotd.map((e) => e.date)), [sotd]);

  return (
    <Screen testID="diary">
      <PageHeader
        eyebrow="Scent of the Day"
        title="Diary"
        subtitle={
          logged > 0 ? `${logged} ${logged === 1 ? 'day' : 'days'} logged` : 'Your wear history lives here'
        }
      />

      {sotd.length === 0 ? (
        <EmptyState
          testID="diary-empty"
          glyph="◈"
          title="Nothing logged yet"
          body="Record what you wear each day and this becomes a history you'll actually want to look back on."
          actionLabel="Log today's scent"
          onAction={() => router.push({ pathname: '/log-sotd', params: { from: 'diary' } })}
        />
      ) : (
        <>
          <View style={styles.streakRow}>
            <Card flat style={styles.streakCard}>
              <Text variant="overline" tone="tertiary">
                Current streak
              </Text>
              <Text variant="stat" tone={streak > 0 ? 'accent' : 'faint'}>
                {streak}
              </Text>
              <Text variant="caption" tone="faint">
                {streak === 1 ? 'day' : 'days'}
              </Text>
            </Card>
            <Card flat style={styles.streakCard}>
              <Text variant="overline" tone="tertiary">
                Best run
              </Text>
              <Text variant="stat">{best}</Text>
              <Text variant="caption" tone="faint">
                {best === 1 ? 'day' : 'days'}
              </Text>
            </Card>
          </View>

          <Card style={styles.heatmapCard}>
            <Text variant="overline" tone="tertiary" style={styles.heatmapLabel}>
              Last 8 weeks
            </Text>
            <View
              style={styles.heatmap}
              accessibilityRole="image"
              accessibilityLabel={`Activity for the last 8 weeks: ${
                heatmapDates.filter((d) => loggedDates.has(d)).length
              } days logged`}
            >
              {heatmapDates.map((d) => (
                <View
                  key={d}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: loggedDates.has(d) ? colors.accent : colors.surface3,
                      opacity: loggedDates.has(d) ? 1 : 0.7,
                    },
                  ]}
                />
              ))}
            </View>
          </Card>

          <Button
            testID="diary-log"
            label="Log today’s scent"
            onPress={() => router.push({ pathname: '/log-sotd', params: { from: 'diary' } })}
            fullWidth
            style={styles.logButton}
          />

          <View style={styles.days}>
            {days.map((day) => (
              <View key={day.date}>
                <Text variant="overline" tone="tertiary" style={styles.dayLabel}>
                  {friendlyDate(day.date)}
                </Text>
                <Card padded={false}>
                  {day.entries.map((entry, i) => {
                    const f = byId.get(entry.fragranceId);
                    return (
                      <Pressable
                        key={entry.id}
                        testID={`diary-entry-${entry.id}`}
                        onPress={() =>
                          f ? router.push({ pathname: '/bottle/[id]', params: { id: f.id } }) : undefined
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${f?.name ?? 'Removed bottle'} on ${friendlyDate(day.date)}`}
                        style={[
                          styles.entry,
                          i > 0
                            ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft }
                            : null,
                        ]}
                      >
                        <View
                          style={[styles.swatch, { backgroundColor: colorForFamily(f?.family, colors) }]}
                        />
                        <View style={styles.fill}>
                          <Text variant="subtitle" numberOfLines={1}>
                            {f?.name ?? 'Removed bottle'}
                          </Text>
                          <Text variant="caption" tone="tertiary" numberOfLines={1}>
                            {[f?.brand, entry.occasion, entry.weather, entry.mood]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </Text>
                          {entry.note ? (
                            <Text variant="small" tone="secondary" style={styles.entryNote}>
                              {entry.note}
                            </Text>
                          ) : null}
                        </View>
                        {entry.rating > 0 ? (
                          <Text variant="caption" tone="accent">
                            {'★'.repeat(entry.rating)}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            ))}
          </View>

          {hidden > 0 ? (
            <Card
              testID="diary-history-locked"
              flat
              onPress={() => {
                analytics().capture('free_cap_hit', { cap: 'history' });
                router.push({ pathname: '/paywall', params: { source: 'diary-history' } });
              }}
              accessibilityLabel={`${hidden} older entries are hidden on the free plan. Tap to see Premium.`}
              style={[styles.locked, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
            >
              <Text variant="overline" tone="accent">
                {hidden} older {hidden === 1 ? 'entry' : 'entries'}
              </Text>
              <Text variant="small" tone="secondary" style={styles.lockedBody}>
                Free keeps the last 30 days. Your older entries are still saved — Premium opens the whole
                diary again.
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  streakRow: { flexDirection: 'row', gap: space.md },
  streakCard: { flex: 1, minHeight: 106 },
  heatmapCard: { marginTop: space.md },
  heatmapLabel: { marginBottom: space.md },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 3 },
  logButton: { marginTop: space.lg },
  days: { marginTop: space.xxl, gap: space.xl },
  dayLabel: { marginBottom: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  swatch: { width: 5, height: 40, borderRadius: 3 },
  entryNote: { marginTop: 4 },
  locked: { marginTop: space.xl, borderWidth: 1 },
  lockedBody: { marginTop: 6 },
});
