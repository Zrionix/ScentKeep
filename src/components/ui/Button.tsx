import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered left of the label — usually a glyph. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the label for screen readers when the label alone lacks context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  /** Fires a light haptic on press. On by default for primary actions. */
  haptic?: boolean;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };
const PAD: Record<ButtonSize, number> = { sm: space.md, md: space.lg, lg: space.xl };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  fullWidth,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
  haptic,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = Boolean(disabled || loading);
  const wantsHaptic = haptic ?? variant === 'primary';

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger },
  };

  const tone = {
    primary: 'onAccent',
    secondary: 'default',
    ghost: 'accent',
    danger: 'danger',
  } as const;

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        if (wantsHaptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.base,
        surface[variant],
        {
          height: HEIGHT[size],
          paddingHorizontal: PAD[size],
          // The press state dims rather than moves, so a mis-tap never shifts
          // the layout under the reader's finger.
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentInk : colors.accent} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text variant={size === 'sm' ? 'small' : 'subtitle'} tone={tone[variant]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { marginRight: 2 },
});
