import React from 'react';
import { StyleSheet } from 'react-native';
import { space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from './Card';
import { Text } from './Text';

/**
 * The one place a Premium gate is drawn.
 *
 * It existed three times in three screens with slightly different wording and
 * padding before this, which is how a paywall starts making promises the code
 * does not keep. Every gate now says the same thing the same way, and the copy
 * describes the FEATURE rather than the restriction — "know before a bottle runs
 * dry" is a reason to pay; "this is locked" is a reason to leave.
 */
export interface LockedCardProps {
  /** What the user would get, phrased as a benefit. */
  title: string;
  /** Optional second line, when the benefit needs a sentence. */
  body?: string;
  onPress: () => void;
  testID: string;
}

export function LockedCard({ title, body, onPress, testID }: LockedCardProps) {
  const { colors } = useTheme();
  return (
    <Card
      testID={testID}
      flat
      onPress={onPress}
      accessibilityLabel={`${title}. Premium feature. Tap to see Premium.`}
      style={[styles.card, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
    >
      <Text variant="overline" tone="accent">
        Premium
      </Text>
      <Text variant="small" tone="secondary" style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" tone="tertiary" style={styles.body}>
          {body}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  title: { marginTop: 4 },
  body: { marginTop: space.sm },
});
