import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { analytics } from '@/lib/analytics';
import { useStore } from '@/state/store';
import { radius, SCENT_FAMILIES, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

// ---------------------------------------------------------------------------
// Onboarding: three quick taps, then straight into the wardrobe.
//
// Deliberately short and skippable. The "aha" is a personalised wardrobe with a
// bottle in it, not a questionnaire — every extra step here costs installs, and
// a dead-ended onboarding is a guaranteed rejection.
// ---------------------------------------------------------------------------

const SIZE_BANDS = [
  { key: '1-4', label: 'Just starting', detail: 'A few bottles' },
  { key: '5-15', label: 'Building it', detail: '5–15 bottles' },
  { key: '16-40', label: 'Serious', detail: '16–40 bottles' },
  { key: '40+', label: 'Collector', detail: '40 or more' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const completeOnboarding = useStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [sizeBand, setSizeBand] = useState<string | null>(null);
  const [families, setFamilies] = useState<string[]>([]);

  React.useEffect(() => {
    analytics().capture('onboarding_started', {});
  }, []);

  const finish = (skipped?: string) => {
    if (skipped) analytics().capture('onboarding_skipped', { step: skipped });
    completeOnboarding({ families, sizeBand });
    analytics().capture('onboarding_completed', {
      collection_size_band: sizeBand ?? 'unspecified',
      families_picked: families.length,
    });
    // `replace`, not `push` — onboarding must never be reachable by a back
    // gesture once it is done.
    router.replace('/(tabs)');
  };

  return (
    <Screen testID="onboarding" contentStyle={styles.content}>
      <View style={styles.progress}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i <= step ? colors.accent : colors.surface3 },
            ]}
          />
        ))}
      </View>

      {step === 0 ? (
        <View style={styles.stepBody}>
          <Text variant="overline" tone="accent">
            Welcome
          </Text>
          <Text variant="display" style={styles.headline}>
            A proper home for your fragrances
          </Text>
          <Text variant="body" tone="secondary" style={styles.blurb}>
            Log the bottles you own, keep a wishlist, and record what you wear each day. Over time
            ScentKeep shows you what you actually reach for — and what has been sitting untouched.
          </Text>

          <View style={styles.pointList}>
            {[
              { glyph: '❖', text: 'Your wardrobe, with photos and notes' },
              { glyph: '◈', text: 'A one-tap Scent of the Day diary' },
              { glyph: '◧', text: 'Insights: most-worn, rotation, cost per wear' },
            ].map((p) => (
              <View key={p.text} style={styles.point}>
                <View style={[styles.pointGlyph, { backgroundColor: colors.accentBg }]}>
                  <Text tone="accent">{p.glyph}</Text>
                </View>
                <Text variant="small" tone="secondary" style={styles.fill}>
                  {p.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepBody}>
          <Text variant="overline" tone="accent">
            Step 2 of 3
          </Text>
          <Text variant="title" style={styles.headline}>
            How big is your collection?
          </Text>
          <Text variant="small" tone="tertiary" style={styles.blurb}>
            Just so the app fits how you collect. You can change this later.
          </Text>

          <View style={styles.bandList}>
            {SIZE_BANDS.map((b) => {
              const active = sizeBand === b.key;
              return (
                <Pressable
                  key={b.key}
                  testID={`size-band-${b.key}`}
                  onPress={() => setSizeBand(b.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${b.label}, ${b.detail}`}
                  style={[
                    styles.band,
                    {
                      backgroundColor: active ? colors.accentBg : colors.surface,
                      borderColor: active ? colors.accentLine : colors.line,
                    },
                  ]}
                >
                  <View style={styles.fill}>
                    <Text variant="subtitle" tone={active ? 'accent' : 'default'}>
                      {b.label}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {b.detail}
                    </Text>
                  </View>
                  {active ? <Text tone="accent">✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepBody}>
          <Text variant="overline" tone="accent">
            Step 3 of 3
          </Text>
          <Text variant="title" style={styles.headline}>
            What do you gravitate to?
          </Text>
          <Text variant="small" tone="tertiary" style={styles.blurb}>
            Pick any that sound like you — this shapes your insights. Optional.
          </Text>

          <View style={styles.familyWrap}>
            <TagRow>
              {SCENT_FAMILIES.map((f) => (
                <Tag
                  key={f}
                  label={f}
                  family
                  selected={families.includes(f)}
                  testID={`family-${f}`}
                  onPress={() =>
                    setFamilies((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
                  }
                />
              ))}
            </TagRow>
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button
          testID="onboarding-next"
          label={step === 2 ? 'Open my wardrobe' : 'Continue'}
          onPress={() => (step === 2 ? finish() : setStep((s) => s + 1))}
          size="lg"
          fullWidth
        />
        {step > 0 ? (
          <Button
            testID="onboarding-skip"
            label="Skip"
            variant="ghost"
            onPress={() => finish(`step-${step}`)}
            style={styles.skip}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between' },
  progress: { flexDirection: 'row', gap: 6, marginBottom: space.xxl },
  progressDot: { height: 3, flex: 1, borderRadius: 2 },
  stepBody: { flex: 1 },
  headline: { marginTop: space.md },
  blurb: { marginTop: space.md },
  pointList: { marginTop: space.xxl, gap: space.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointGlyph: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bandList: { marginTop: space.xl, gap: space.md },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  familyWrap: { marginTop: space.xl },
  footer: { marginTop: space.xxl },
  skip: { marginTop: space.sm },
});
