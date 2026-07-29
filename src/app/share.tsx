import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, ShelfCard } from '@/components/ShelfCard';
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
import { analytics } from '@/lib/analytics';
import { goBack } from '@/lib/nav';
import { useStore } from '@/state/store';
import { space } from '@/theme';

// ---------------------------------------------------------------------------
// Share your shelf.
//
// Free, and deliberately so — this is a growth surface, not a paid one. Gating
// the thing that puts the app in front of other people would be charging for
// marketing.
//
// The card renders on screen rather than off it. An off-screen capture is a
// recurring source of blank images on both platforms, and showing the user the
// exact bitmap they are about to post is better behaviour anyway.
// ---------------------------------------------------------------------------

const MODES: ShelfCardMode[] = ['most-worn', 'top-rated', 'recent'];

export default function ShareScreen() {
  const router = useRouter();
  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);

  const [mode, setMode] = useState<ShelfCardMode>('most-worn');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);

  const data = useMemo(() => buildShelfCard(fragrances, sotd, mode), [fragrances, sotd, mode]);

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
        dialogTitle: 'Share your wardrobe',
        UTI: 'public.png',
      });
      analytics().capture('share_card_created', { kind: 'collection' });
    } catch {
      Alert.alert('Share', 'Could not create the image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
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
    <Screen testID="share" bottomInset={20}>
      <PageHeader
        eyebrow="Share"
        title="Your shelf"
        subtitle="A card for the collection, without a single price on it."
      />

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

      {/* Horizontal scroll rather than a scaled-down preview: the card is a
          fixed size by design, and shrinking it to fit would show the user
          something other than what gets exported. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.previewScroll}
        style={styles.preview}
      >
        <View ref={cardRef} collapsable={false}>
          <ShelfCard data={data} />
        </View>
      </ScrollView>

      <Text variant="caption" tone="faint" style={styles.note}>
        Prices, dates and your diary never appear on the card — only what you own and how often you
        wear it. Captured at {CARD_WIDTH}×{CARD_HEIGHT}, {CARD_SCALE}× for a sharp post.
      </Text>

      <Button
        testID="share-export"
        label={busy ? 'Preparing…' : 'Share this card'}
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
