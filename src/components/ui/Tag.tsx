import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colorForFamily, radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface TagProps {
  label: string;
  /** Renders the olfactory-family dot in that family's hue. */
  family?: boolean;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function Tag({ label, family, selected, onPress, testID }: TagProps) {
  const { colors } = useTheme();

  const content = (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: selected ? colors.accentBg : colors.surface2,
          borderColor: selected ? colors.accentLine : colors.line,
        },
      ]}
    >
      {family ? (
        <View style={[styles.dot, { backgroundColor: colorForFamily(label, colors) }]} />
      ) : null}
      <Text variant="caption" tone={selected ? 'accent' : 'secondary'}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: Boolean(selected) }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function TagRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
