import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { suggestToday, type Suggestion } from '@/domain/suggest';
import type { Fragrance, SotdEntry } from '@/domain/types';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

// ---------------------------------------------------------------------------
// "What should I wear today?" — the reason to OPEN the app rather than remember
// to update it.
//
// Free on purpose. It is the habit the rest of the product depends on, and a
// habit behind a paywall is a habit nobody forms.
//
// Two rules the design has to keep:
//   - the reason is never hidden. A pick with no explanation is indistinguishable
//     from a random one, and the first odd choice destroys trust in every other
//     number the app shows.
//   - "something else" is always one tap away. A recommender that insists is
//     worse than one that suggests.
// ---------------------------------------------------------------------------

/** Below this the shortlist is just "your shelf", and pretending otherwise is
 *  theatre. Three bottles is where a choice starts to exist. */
export const MIN_SHELF_FOR_SUGGESTION = 3;

/** How many alternates to reveal behind "Something else". */
const ALTERNATES = 3;

export interface TodaySuggestionProps {
  fragrances: Fragrance[];
  entries: SotdEntry[];
  onWear: (fragrance: Fragrance) => void;
  onOpen: (fragrance: Fragrance) => void;
}

export function TodaySuggestion({ fragrances, entries, onWear, onOpen }: TodaySuggestionProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const ranked = useMemo(() => suggestToday(fragrances, entries), [fragrances, entries]);
  const owned = useMemo(() => fragrances.filter((f) => !f.inWishlist), [fragrances]);

  if (owned.length < MIN_SHELF_FOR_SUGGESTION || ranked.length === 0) return null;

  const [top, ...rest] = ranked;

  return (
    <Card
      testID="today-suggestion"
      style={[styles.card, { borderColor: colors.accentLine }]}
      accessibilityLabel={`Suggested for today: ${top.fragrance.name}. ${top.reasons[0]}`}
    >
      <Text variant="overline" tone="accent">
        Today’s pick
      </Text>

      <Pressable
        testID="today-suggestion-open"
        onPress={() => onOpen(top.fragrance)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${top.fragrance.name}`}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.swatch, { backgroundColor: colorForFamily(top.fragrance.family, colors) }]} />
        <View style={styles.fill}>
          <Text variant="title" numberOfLines={2}>
            {top.fragrance.name}
          </Text>
          {top.fragrance.brand ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {top.fragrance.brand}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* Every reason the engine actually used, not a marketing line. Capped at
          two so the card stays a glance rather than a paragraph. */}
      <View style={styles.reasons}>
        {top.reasons.slice(0, 2).map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <Text variant="caption" tone="accent" style={styles.bullet}>
              ·
            </Text>
            <Text variant="small" tone="secondary" style={styles.fill}>
              {reason}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="today-suggestion-wear"
          onPress={() => onWear(top.fragrance)}
          accessibilityRole="button"
          accessibilityLabel={`Log ${top.fragrance.name} as today's scent`}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text variant="small" tone="onAccent">
            Wear this
          </Text>
        </Pressable>

        {rest.length > 0 ? (
          <Pressable
            testID="today-suggestion-more"
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide other suggestions' : 'Show other suggestions'}
            style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text variant="small" tone="tertiary">
              {expanded ? 'Fewer' : 'Something else'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <View testID="today-suggestion-alternates" style={[styles.alternates, { borderTopColor: colors.line }]}>
          {rest.slice(0, ALTERNATES).map((s) => (
            <Alternate key={s.fragrance.id} suggestion={s} onWear={onWear} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Alternate({
  suggestion,
  onWear,
}: {
  suggestion: Suggestion;
  onWear: (f: Fragrance) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`today-alternate-${suggestion.fragrance.id}`}
      onPress={() => onWear(suggestion.fragrance)}
      accessibilityRole="button"
      accessibilityLabel={`Log ${suggestion.fragrance.name}. ${suggestion.reasons[0]}`}
      style={({ pressed }) => [styles.altRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.altSwatch, { backgroundColor: colorForFamily(suggestion.fragrance.family, colors) }]} />
      <View style={styles.fill}>
        <Text variant="subtitle" numberOfLines={1}>
          {suggestion.fragrance.name}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {suggestion.reasons[0]}
        </Text>
      </View>
      <Text tone="faint">›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { marginBottom: space.lg, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  swatch: { width: 6, height: 44, borderRadius: 3 },
  reasons: { marginTop: space.md, gap: 2 },
  reasonRow: { flexDirection: 'row', gap: space.sm },
  bullet: { width: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  primary: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
  },
  secondary: { paddingVertical: space.sm + 2, paddingHorizontal: space.sm },
  alternates: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  altRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  altSwatch: { width: 4, height: 32, borderRadius: 2 },
});
