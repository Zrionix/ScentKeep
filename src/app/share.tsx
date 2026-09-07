import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import {
  CARD_HEIGHT,
  CARD_LOGICAL_HEIGHT,
  CARD_WIDTH,
  ShelfCard,
} from '@/components/ShelfCard';
import { SotdCard } from '@/components/SotdCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Screen } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import {
  buildShelfCard,
  MIN_BOTTLES_FOR_CARD,
  MODE_LABEL,
  type ShelfCardMode,
} from '@/domain/shelfCard';
import { buildSotdCard } from '@/domain/sotdCard';
import { analytics } from '@/lib/analytics';
import { goBack } from '@/lib/nav';
import { useStore } from '@/state/store';
import { space } from '@/theme';

// Share a card.
//
// Two compositions, one screen:
//   - Collection (Settings -> Share your shelf). The original card.
//   - SOTD (/share?kind=sotd&fragranceId=). The daily card, opened from
//     Today after a log. More postable, same honesty rules.
//
// Free, and deliberately so -- this is a growth surface, not a paid one. Gating
// the thing that puts the app in front of other people would be charging for
// marketing.
//
// The card renders on screen rather than off it. An off-screen capture is a
// recurring source of blank images on both platforms, and showing the user the
// exact bitmap they are about to post is better behaviour anyway.

const MODES: ShelfCardMode[] = ['most-worn', 'top-rated', 'recent'];

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string | string[]; fragranceId?: string | string[] }>();
  const kind = first(params.kind);
  const fragranceId = first(params.fragranceId);
  const isSotd = kind === 'sotd';

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);

  const [mode, setMode] = useState<ShelfCardMode>('most-worn');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);

  const sotdFragrance = useMemo(
    () => (isSotd && fragranceId ? fragrances.find((f) => f.id === fragranceId) : undefined),
    [isSotd, fragranceId, fragrances],
  );
  const sotdData = useMemo(() => (isSotd ? buildSotdCard(sotdFragrance) : null), [isSotd, sotdFragrance]);
  const shelfData = useMemo(
    () => (isSotd ? null : buildShelfCard(fragrances, sotd, mode)),
    [isSotd, fragrances, sotd, mode],
  );

  const share = async () => {
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Share', 'Sharing is not available on this device.');
        return;
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: isSotd ? "Share today's scent" : 'Share your wardrobe',
        UTI: 'public.png',
      });
      analytics().capture('share_card_created', { kind: isSotd ? 'sotd' : 'collection' });
    } catch {
      Alert.alert('Share', 'Could not create the image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isSotd && !sotdData) {
    return (
      <Screen testID="share-sotd-empty">
        <PageHeader eyebrow="Share" title="Today's scent" />
        <EmptyState
          glyph="❖"
          title="Nothing to put on a card"
          body="Log a bottle you own and you can share today's scent -- no prices, no dates, no diary."
          actionLabel="Back"
          onAction={() => goBack(router)}
        />
      </Screen>
    );
  }

  if (!isSotd && !shelfData) {
    return (
      <Screen testID="share-empty">
        <PageHeader eyebrow="Share" title="Your shelf" />
        <EmptyState
          glyph="❖"
          title="Not quite enough yet"
          body={`Add at least ${MIN_BOTTLES_FOR_CARD} bottles and there'll be a card worth posting.`}
          actionLabel="Add a bottle"
          onAction={() => router.push('/bottle/new')}
        />
        <Button label="Back" variant="ghost" fullWidth onPress={() => goBack(router)} />
      </Screen>
    );
  }

  return (
    <Screen testID={isSotd ? 'share-sotd' : 'share'} bottomInset={20}>
      <PageHeader
        eyebrow="Share"
        title={isSotd ? "Today's scent" : 'Your shelf'}
        subtitle={
          isSotd
            ? "A card of what you're wearing. No prices, no dates, no diary."
            : 'A card for the collection, without a single price on it.'
        }
      />

      {!isSotd ? (
        <TagRow>
          {MODES.map((m) => (
            <Tag
              key={m}
              label={MODE_LABEL[m]}
              selected={mode === m}
              testID={`share-mode-${m}`}
              onPress={() => setMode(m)}
            />
          ))}
        </TagRow>
      ) : null}

      {/* Horizontal scroll rather than a scaled-down preview: the card is a
          fixed size by design, and shrinking it to fit would show the user
          something other than what gets exported.

          The explicit height is load-bearing. Nested inside the screen's
          vertical ScrollView, a horizontal one collapses to a fraction of its
          content height and crops the bottom of the card -- wordmark included --
          without any warning that it has done so. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.previewScroll}
        style={[styles.preview, { height: CARD_LOGICAL_HEIGHT }]}
      >
        <View ref={cardRef} collapsable={false}>
          {isSotd && sotdData ? <SotdCard data={sotdData} /> : shelfData ? <ShelfCard data={shelfData} /> : null}
        </View>
      </ScrollView>

      <Text variant="caption" tone="faint" style={styles.note}>
        {isSotd
          ? 'Prices, dates and your diary never appear on the card -- only the bottle and the house. '
          : 'Prices, dates and your diary never appear on the card -- only what you own and how often you wear it. '}
        Exported at {CARD_WIDTH}x{CARD_HEIGHT}.
      </Text>

      <Button
        testID="share-export"
        label={busy ? 'Preparing...' : 'Share this card'}
        onPress={share}
        disabled={busy}
        size="lg"
        fullWidth
        style={styles.action}
      />
      <Button label="Back" variant="ghost" fullWidth style={styles.back} onPress={() => goBack(router)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { marginTop: space.xl, marginHorizontal: -space.lg },
  previewScroll: { paddingHorizontal: space.lg },
  note: { marginTop: space.lg },
  action: { marginTop: space.xl },
  back: { marginTop: space.sm },
});