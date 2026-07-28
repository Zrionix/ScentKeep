import React from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { cardShadow, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Inset variant sits on the page rather than floating above it. */
  flat?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({ children, onPress, flat, padded = true, style, accessibilityLabel, testID }: CardProps) {
  const { colors } = useTheme();

  const surface = [
    styles.card,
    {
      backgroundColor: flat ? colors.surface2 : colors.surface,
      borderColor: colors.line,
      padding: padded ? space.lg : 0,
    },
    flat ? null : cardShadow(colors),
    style,
  ];

  // A non-pressable card still carries its testID and label. Attaching them only
  // to the Pressable branch made every static card invisible to tests and to
  // accessibility tooling, purely because it happened to lack an onPress.
  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} style={surface}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View style={surface}>{children}</View>
    </Pressable>
  );
}

export interface StatCardProps {
  label: string;
  value: string;
  /** Small supporting line under the number, e.g. "based on 9 of 14 bottles". */
  caption?: string;
  onPress?: () => void;
  /** Renders the locked treatment and an upgrade affordance. */
  locked?: boolean;
  testID?: string;
}

/**
 * The stats tile. `caption` exists specifically so a number can carry its own
 * caveat — a collection value that only covers the priced bottles says so right
 * there, rather than implying it covers the whole shelf.
 */
export function StatCard({ label, value, caption, onPress, locked, testID }: StatCardProps) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={onPress}
      testID={testID}
      accessibilityLabel={locked ? `${label}, locked. ${value}` : `${label}: ${value}${caption ? `. ${caption}` : ''}`}
      style={styles.stat}
    >
      <Text variant="overline" tone="tertiary">
        {label}
      </Text>
      <Text variant="stat" tone={locked ? 'faint' : 'default'} style={styles.statValue}>
        {locked ? '—' : value}
      </Text>
      {caption ? (
        <Text variant="caption" tone="faint" style={styles.statCaption}>
          {caption}
        </Text>
      ) : null}
      {locked ? (
        <View style={[styles.lockPill, { backgroundColor: colors.accentBg, borderColor: colors.accentLine }]}>
          <Text variant="caption" tone="accent">
            Premium
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, minHeight: 108, justifyContent: 'flex-start' },
  statValue: { marginTop: space.sm },
  statCaption: { marginTop: 2 },
  lockPill: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
