import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Rating } from '@/components/ui/Rating';
import { EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { alreadyLogged, currentStreak } from '@/domain/sotd';
import { ownedBottles } from '@/domain/stats';
import { pickForToday } from '@/domain/suggest';
import { analytics } from '@/lib/analytics';
import { goBack } from '@/lib/nav';
import { syncReminders } from '@/lib/notifications';
import { todayIso } from '@/lib/dates';
import { useStore } from '@/state/store';
import { colorForFamily, OCCASIONS, radius, space, type as typeScale } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

// ---------------------------------------------------------------------------
// The Scent of the Day moment — the app's daily loop and signature interaction.
//
// The whole screen is built so the minimum path is ONE tap: pick a bottle, done.
// Occasion, mood and a note are all optional and live below the fold, because a
// diary you have to fill in properly is a diary nobody fills in.
// ---------------------------------------------------------------------------

const WEATHERS = ['Hot', 'Warm', 'Mild', 'Cool', 'Cold', 'Rain', 'Humid'];
const MOODS = ['Confident', 'Relaxed', 'Sharp', 'Cosy', 'Playful', 'Serious'];

export default function LogSotdScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ from?: string; fragranceId?: string }>();

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const logSotd = useStore((s) => s.logSotd);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const owned = useMemo(() => ownedBottles(fragrances), [fragrances]);
  const today = todayIso();

  const [selectedId, setSelectedId] = useState<string | null>(params.fragranceId ?? null);
  const [query, setQuery] = useState('');
  const [occasion, setOccasion] = useState<string | null>(null);
  const [weather, setWeather] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [askReminder, setAskReminder] = useState(false);

  // The same recommender the home screen uses, rather than a second, weaker one
  // that could disagree with it on the same morning.
  const suggestion = useMemo(() => pickForToday(fragrances, sotd), [fragrances, sotd]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? owned.filter((f) => `${f.name} ${f.brand}`.toLowerCase().includes(q))
      : owned;
    // Bottles already logged today sink to the bottom — they can't be picked
    // again, so they shouldn't sit at the top of the list.
    return [...list].sort((a, b) => {
      const aLogged = alreadyLogged(sotd, a.id, today) ? 1 : 0;
      const bLogged = alreadyLogged(sotd, b.id, today) ? 1 : 0;
      return aLogged - bLogged || a.name.localeCompare(b.name);
    });
  }, [owned, query, sotd, today]);

  const submit = () => {
    if (!selectedId) return;
    const result = logSotd({
      fragranceId: selectedId,
      date: today,
      occasion,
      weather,
      mood,
      note: note.trim() || null,
      rating,
    });

    if (!result.ok) {
      setError(
        result.reason === 'duplicate'
          ? 'You have already logged that bottle today.'
          : 'That bottle is no longer in your collection.',
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    analytics().capture('sotd_logged', {
      collection_size: owned.length,
      streak: currentStreak(useStore.getState().sotd),
      from: (params.from as 'home' | 'diary' | 'bottle' | 'reminder') ?? 'home',
    });

    // The reminder ask lives HERE and nowhere else.
    //
    // iOS shows its permission sheet once per install, so there is exactly one
    // chance to get a yes. This is the moment it is worth spending: the user has
    // just logged a scent, which is precisely the habit a daily nudge
    // reinforces. Asking on first launch — which is what the old
    // `reminderEnabled: true` default did — spent that one chance on someone who
    // had not yet seen a bottle.
    //
    // Offered once ever, tracked by reminderPromptedAt, because a second ask is
    // either a no-op or nagging.
    if (!settings.reminderEnabled && settings.reminderPromptedAt === null) {
      setAskReminder(true);
      return;
    }

    goBack(router);
  };

  /** Records that the offer was made, whichever way it was answered, so it is
   *  never made again. */
  const answerReminder = async (wants: boolean) => {
    const askedAt = new Date().toISOString();
    if (!wants) {
      updateSettings({ reminderPromptedAt: askedAt });
      goBack(router);
      return;
    }
    const scheduled = await syncReminders({ ...settings, reminderEnabled: true });
    // Only claim it is on if the OS actually agreed. A denial at the system
    // sheet must leave the switch OFF, or Settings shows a reminder that will
    // never arrive — the exact lie the old startup path told.
    updateSettings({ reminderEnabled: scheduled, reminderPromptedAt: askedAt });
    if (scheduled) {
      analytics().capture('reminder_scheduled', { time: settings.reminderTime });
    }
    goBack(router);
  };

  // Shown after the log is already saved, so dismissing it loses nothing.
  if (askReminder) {
    return (
      <Screen testID="sotd-reminder-ask">
        <PageHeader eyebrow="Logged" title="Want a nudge tomorrow?" />
        <Card flat style={styles.askCard}>
          <Text variant="body">
            A quiet reminder at {settings.reminderTime} to log what you are wearing. No streaks to
            lose, no badges — just the nudge.
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.askNote}>
            You can change the time or turn this off in Settings at any point.
          </Text>
        </Card>
        <View style={styles.actions}>
          <Button
            testID="reminder-yes"
            label="Yes, remind me"
            onPress={() => { answerReminder(true); }}
            size="lg"
            fullWidth
          />
          <Button
            testID="reminder-no"
            label="Not now"
            variant="ghost"
            onPress={() => { answerReminder(false); }}
            style={styles.cancel}
          />
        </View>
      </Screen>
    );
  }

  if (owned.length === 0) {
    return (
      <Screen testID="log-sotd-empty">
        <PageHeader title="Scent of the Day" />
        <EmptyState
          glyph="❖"
          title="Add a bottle first"
          body="The diary logs what you wear from your wardrobe — add a bottle and you can start today."
          actionLabel="Add a bottle"
          onAction={() => router.replace('/bottle/new')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="log-sotd" bottomInset={80}>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title="What are you wearing?"
      />

      {suggestion && !selectedId ? (
        <Card
          flat
          testID="rediscover-suggestion"
          onPress={() => {
            analytics().capture('suggestion_accepted', { source: 'log' });
            setSelectedId(suggestion.fragrance.id);
          }}
          accessibilityLabel={`Suggestion: ${suggestion.fragrance.name}. ${suggestion.reasons[0]} Tap to select.`}
          style={[styles.suggestion, { borderColor: colors.accentLine }]}
        >
          <Text variant="overline" tone="accent">
            Suggested
          </Text>
          <Text variant="subtitle" style={styles.suggestionName}>
            {suggestion.fragrance.name}
          </Text>
          {/* The reason, not just the name. Without it this is a card that
              picks a bottle for reasons the reader cannot check. */}
          <Text variant="caption" tone="tertiary">
            {suggestion.reasons[0]}
          </Text>
        </Card>
      ) : null}

      <View style={[styles.search, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
        <Text tone="faint">⌕</Text>
        <TextInput
          testID="sotd-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Find a bottle"
          placeholderTextColor={colors.ink4}
          accessibilityLabel="Search your bottles"
          style={[typeScale.body, styles.searchInput, { color: colors.ink }]}
        />
      </View>

      <View style={styles.list}>
        {matches.map((f) => {
          const logged = alreadyLogged(sotd, f.id, today);
          const selected = selectedId === f.id;
          return (
            <Pressable
              key={f.id}
              testID={`sotd-pick-${f.id}`}
              disabled={logged}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedId(selected ? null : f.id);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: logged }}
              accessibilityLabel={
                logged ? `${f.name}, already logged today` : `${f.name} by ${f.brand || 'unknown house'}`
              }
              style={[
                styles.row,
                {
                  backgroundColor: selected ? colors.accentBg : colors.surface,
                  borderColor: selected ? colors.accentLine : colors.line,
                  opacity: logged ? 0.45 : 1,
                },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: colorForFamily(f.family, colors) }]} />
              <View style={styles.fill}>
                <Text variant="subtitle" numberOfLines={1} tone={selected ? 'accent' : 'default'}>
                  {f.name}
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {logged ? 'Already logged today' : f.brand || '—'}
                </Text>
              </View>
              {selected ? <Text tone="accent">✓</Text> : null}
            </Pressable>
          );
        })}
        {matches.length === 0 ? (
          <Text variant="small" tone="tertiary" center style={styles.noMatch}>
            No bottle matches “{query}”.
          </Text>
        ) : null}
      </View>

      {selectedId ? (
        <View testID="sotd-details">
          <SectionHeader title="Optional details" />

          <Text variant="overline" tone="tertiary" style={styles.facetLabel}>
            Occasion
          </Text>
          <TagRow>
            {OCCASIONS.map((o) => (
              <Tag key={o} label={o} selected={occasion === o} onPress={() => setOccasion(occasion === o ? null : o)} />
            ))}
          </TagRow>

          <Text variant="overline" tone="tertiary" style={styles.facetLabel}>
            Weather
          </Text>
          <TagRow>
            {WEATHERS.map((w) => (
              <Tag key={w} label={w} selected={weather === w} onPress={() => setWeather(weather === w ? null : w)} />
            ))}
          </TagRow>

          <Text variant="overline" tone="tertiary" style={styles.facetLabel}>
            Mood
          </Text>
          <TagRow>
            {MOODS.map((m) => (
              <Tag key={m} label={m} selected={mood === m} onPress={() => setMood(mood === m ? null : m)} />
            ))}
          </TagRow>

          <View style={styles.ratingWrap}>
            <Rating label="How did it wear?" value={rating} onChange={setRating} testID="sotd-rating" />
          </View>

          <Field
            label="Note"
            testID="sotd-note"
            value={note}
            onChangeText={setNote}
            placeholder="Anything worth remembering about today's wear"
            multiline
            maxLength={2000}
          />
        </View>
      ) : null}

      {error ? (
        <Text variant="small" tone="danger" center style={styles.error} testID="sotd-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          testID="sotd-submit"
          label={selectedId ? 'Log today’s scent' : 'Pick a bottle'}
          onPress={submit}
          disabled={!selectedId}
          size="lg"
          fullWidth
        />
        <Button label="Cancel" variant="ghost" onPress={() => goBack(router)} style={styles.cancel} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  suggestion: { marginBottom: space.lg, borderWidth: 1 },
  suggestionName: { marginTop: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.lg,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 6, height: 38, borderRadius: 3 },
  noMatch: { paddingVertical: space.xl },
  facetLabel: { marginTop: space.lg, marginBottom: space.sm },
  ratingWrap: { marginTop: space.xl, marginBottom: space.lg },
  error: { marginTop: space.lg },
  askCard: { marginBottom: space.lg },
  askNote: { marginTop: space.md },
  actions: { marginTop: space.xxl },
  cancel: { marginTop: space.sm },
});
