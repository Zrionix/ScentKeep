import React from 'react';
import { ScrollView, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wraps content in a ScrollView. Turn off for FlatList-based screens. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding so content clears a floating action button. */
  bottomInset?: number;
  testID?: string;
}

export function Screen({ children, scroll = true, style, contentStyle, bottomInset = 0, testID }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingTop: insets.top + space.sm,
    paddingBottom: insets.bottom + space.xl + bottomInset,
    paddingHorizontal: space.lg,
  };

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.fill, { backgroundColor: colors.bg }, style]}>
        <View style={[styles.fill, padding, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={[styles.fill, { backgroundColor: colors.bg }, style]}
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export interface PageHeaderProps {
  title: string;
  /** Letterspaced eyebrow above the title. */
  eyebrow?: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, eyebrow, subtitle, right }: PageHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {eyebrow ? (
          <Text variant="overline" tone="accent" style={styles.eyebrow}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="tertiary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export interface EmptyStateProps {
  /** A large glyph or emoji sitting above the copy. */
  glyph?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ glyph = '⌘', title, body, actionLabel, onAction, testID }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.empty}>
      <View style={[styles.emptyGlyph, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
        <Text style={styles.emptyGlyphText} tone="accent">
          {glyph}
        </Text>
      </View>
      <Text variant="heading" center style={styles.emptyTitle}>
        {title}
      </Text>
      <Text variant="small" tone="tertiary" center style={styles.emptyBody}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

/** A hairline rule used to separate sections without adding a heavy border. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.lineSoft }, style]} />;
}

/** Section label + optional trailing action, used above lists. */
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="tertiary">
        {title}
      </Text>
      {action && onAction ? <Button label={action} variant="ghost" size="sm" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.xl },
  headerText: { flex: 1 },
  headerRight: { marginLeft: space.md, paddingBottom: 4 },
  eyebrow: { marginBottom: 6 },
  subtitle: { marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.lg },
  emptyGlyph: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.lg,
  },
  emptyGlyphText: { fontSize: 30, lineHeight: 36 },
  emptyTitle: { marginBottom: space.sm },
  emptyBody: { maxWidth: 300 },
  emptyAction: { marginTop: space.xl },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
    marginTop: space.xl,
  },
});
