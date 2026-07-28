import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field, NumberField } from '@/components/ui/Field';
import { Rating } from '@/components/ui/Rating';
import { Divider, PageHeader, Screen, SectionHeader } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { emptyDraft, type FragranceDraft } from '@/domain/types';
import { validateFragrance } from '@/domain/wardrobe';
import { analytics } from '@/lib/analytics';
import { pickErrorMessage, pickFromLibrary, takePhoto } from '@/lib/photos';
import { useStore } from '@/state/store';
import { OCCASIONS, radius, SCENT_FAMILIES, SEASONS, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

export default function BottleFormScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; wishlist?: string }>();

  const fragrances = useStore((s) => s.fragrances);
  const addFragrance = useStore((s) => s.addFragrance);
  const updateFragrance = useStore((s) => s.updateFragrance);

  const editing = params.id ? fragrances.find((f) => f.id === params.id) : undefined;
  const isEdit = Boolean(editing);

  const [draft, setDraft] = useState<FragranceDraft>(() => {
    if (editing) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = editing;
      return rest;
    }
    return emptyDraft({ inWishlist: params.wishlist === '1' });
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [capError, setCapError] = useState<string | null>(null);

  const set = <K extends keyof FragranceDraft>(key: K, value: FragranceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggle = (key: 'seasons' | 'occasions', value: string) =>
    setDraft((d) => {
      const list = d[key] as string[];
      return {
        ...d,
        [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
      };
    });

  const collectionSize = useMemo(
    () => fragrances.filter((f) => f.inWishlist === draft.inWishlist).length,
    [fragrances, draft.inWishlist],
  );

  const addPhoto = async (from: 'camera' | 'library') => {
    const result = from === 'camera' ? await takePhoto() : await pickFromLibrary();
    if (result.ok) {
      set('photoUrl', result.uri);
      return;
    }
    const message = pickErrorMessage(result);
    if (message) Alert.alert('Photo', message);
  };

  const save = () => {
    const found = validateFragrance({
      name: draft.name,
      brand: draft.brand,
      sizeMl: draft.sizeMl,
      price: draft.price,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    if (isEdit && editing) {
      updateFragrance(editing.id, draft);
      analytics().capture('bottle_edited', { in_wishlist: draft.inWishlist });
      router.back();
      return;
    }

    const result = addFragrance(draft);
    if (!result.ok) {
      // The cap is enforced in the store, so the form must handle being refused
      // rather than assuming the caller already checked.
      setCapError(
        result.reason === 'cap-wishlist'
          ? 'Your free wishlist is full. Premium removes the limit.'
          : 'Your free wardrobe is full. Premium makes it unlimited.',
      );
      analytics().capture('free_cap_hit', { cap: draft.inWishlist ? 'wishlist' : 'wardrobe' });
      return;
    }

    analytics().capture('bottle_added', {
      in_wishlist: draft.inWishlist,
      has_photo: Boolean(draft.photoUrl),
      has_price: draft.price !== null,
      collection_size: collectionSize + 1,
    });
    router.back();
  };

  return (
    <Screen testID="bottle-form" bottomInset={40}>
      <PageHeader
        eyebrow={draft.inWishlist ? 'Wishlist' : 'Wardrobe'}
        title={isEdit ? 'Edit bottle' : draft.inWishlist ? 'Add a wish' : 'Add a bottle'}
      />

      <Pressable
        testID="bottle-photo"
        onPress={() =>
          Alert.alert('Bottle photo', 'Add a picture of the bottle', [
            { text: 'Take a photo', onPress: () => addPhoto('camera') },
            { text: 'Choose from library', onPress: () => addPhoto('library') },
            ...(draft.photoUrl
              ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => set('photoUrl', null) }]
              : []),
            { text: 'Cancel', style: 'cancel' as const },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel={draft.photoUrl ? 'Change bottle photo' : 'Add a bottle photo'}
        style={[styles.photo, { backgroundColor: colors.surface2, borderColor: colors.line }]}
      >
        {draft.photoUrl ? (
          <Image source={{ uri: draft.photoUrl }} style={styles.photoImage} contentFit="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <Text style={styles.photoGlyph} tone="faint">
              ⌾
            </Text>
            <Text variant="caption" tone="tertiary">
              Add photo
            </Text>
          </View>
        )}
      </Pressable>

      <Field
        label="Name"
        required
        testID="field-name"
        value={draft.name}
        onChangeText={(v) => set('name', v)}
        error={errors.name}
        placeholder="Bleu de Chanel"
        maxLength={120}
        autoCapitalize="words"
      />

      <Field
        label="House"
        testID="field-brand"
        value={draft.brand}
        onChangeText={(v) => set('brand', v)}
        error={errors.brand}
        placeholder="Chanel"
        maxLength={120}
        autoCapitalize="words"
      />

      <SectionHeader title="Family" />
      <TagRow>
        {SCENT_FAMILIES.map((f) => (
          <Tag
            key={f}
            label={f}
            family
            selected={draft.family === f}
            testID={`family-${f}`}
            onPress={() => set('family', draft.family === f ? null : f)}
          />
        ))}
      </TagRow>

      <SectionHeader title="Notes" />
      <Field
        label="Top"
        value={draft.notesTop ?? ''}
        onChangeText={(v) => set('notesTop', v || null)}
        placeholder="Bergamot, Pink Pepper"
        maxLength={500}
      />
      <Field
        label="Heart"
        value={draft.notesHeart ?? ''}
        onChangeText={(v) => set('notesHeart', v || null)}
        placeholder="Lavender, Geranium"
        maxLength={500}
      />
      <Field
        label="Base"
        value={draft.notesBase ?? ''}
        onChangeText={(v) => set('notesBase', v || null)}
        placeholder="Ambroxan, Cedar"
        maxLength={500}
      />

      <SectionHeader title="The bottle" />
      <View style={styles.pair}>
        <View style={styles.fill}>
          <NumberField
            label="Size"
            suffix="ml"
            testID="field-size"
            value={draft.sizeMl}
            onChangeNumber={(v) => set('sizeMl', v)}
            error={errors.sizeMl}
            placeholder="100"
          />
        </View>
        <View style={styles.fill}>
          <NumberField
            label="Price"
            testID="field-price"
            value={draft.price}
            onChangeNumber={(v) => set('price', v)}
            error={errors.price}
            placeholder="129"
            hint="Optional"
          />
        </View>
      </View>

      <SectionHeader title="When you wear it" />
      <Text variant="overline" tone="tertiary" style={styles.facetLabel}>
        Seasons
      </Text>
      <TagRow>
        {SEASONS.map((s) => (
          <Tag
            key={s}
            label={s}
            selected={draft.seasons.includes(s)}
            testID={`season-${s}`}
            onPress={() => toggle('seasons', s)}
          />
        ))}
      </TagRow>

      <Text variant="overline" tone="tertiary" style={styles.facetLabel}>
        Occasions
      </Text>
      <TagRow>
        {OCCASIONS.map((o) => (
          <Tag
            key={o}
            label={o}
            selected={draft.occasions.includes(o)}
            testID={`occasion-${o}`}
            onPress={() => toggle('occasions', o)}
          />
        ))}
      </TagRow>

      <SectionHeader title="How it performs" />
      <View style={styles.ratings}>
        <Rating label="Overall" value={draft.rating} onChange={(v) => set('rating', v as never)} testID="rating-overall" />
        <Rating label="Longevity" value={draft.longevity} onChange={(v) => set('longevity', v as never)} testID="rating-longevity" />
        <Rating label="Sillage" value={draft.sillage} onChange={(v) => set('sillage', v as never)} testID="rating-sillage" />
      </View>

      <Divider />

      <Field
        label="Personal notes"
        value={draft.notes ?? ''}
        onChangeText={(v) => set('notes', v || null)}
        placeholder="Where you bought it, who it reminds you of, when it works best…"
        multiline
        maxLength={4000}
      />

      {capError ? (
        <View testID="form-cap-error" style={styles.capBlock}>
          <Text variant="small" tone="danger" center>
            {capError}
          </Text>
          <Button
            label="See Premium"
            variant="secondary"
            onPress={() => router.push({ pathname: '/paywall', params: { source: 'form-cap' } })}
            style={styles.capButton}
          />
        </View>
      ) : null}

      <Button
        testID="bottle-save"
        label={isEdit ? 'Save changes' : draft.inWishlist ? 'Add to wishlist' : 'Add to wardrobe'}
        onPress={save}
        size="lg"
        fullWidth
        style={styles.save}
      />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={styles.cancel} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  photo: {
    height: 200,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', gap: 6 },
  photoGlyph: { fontSize: 34, lineHeight: 40 },
  pair: { flexDirection: 'row', gap: space.md },
  facetLabel: { marginTop: space.lg, marginBottom: space.sm },
  ratings: { gap: space.xl },
  capBlock: { marginTop: space.lg, gap: space.md },
  capButton: { alignSelf: 'center' },
  save: { marginTop: space.xl },
  cancel: { marginTop: space.sm },
});
