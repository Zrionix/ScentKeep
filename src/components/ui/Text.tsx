import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { type Palette, type TypeStyle, type as typeScale } from '@/theme';

export type TextVariant = keyof typeof typeScale;
export type TextTone = 'default' | 'secondary' | 'tertiary' | 'faint' | 'accent' | 'positive' | 'danger' | 'onAccent';

const TONE: Record<TextTone, (p: Palette) => string> = {
  default: (p) => p.ink,
  secondary: (p) => p.ink2,
  tertiary: (p) => p.ink3,
  faint: (p) => p.ink4,
  accent: (p) => p.accent,
  positive: (p) => p.positive,
  danger: (p) => p.danger,
  onAccent: (p) => p.accentInk,
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  center?: boolean;
  children?: React.ReactNode;
}

/**
 * The only text component in the app. Every size, weight and colour comes from
 * the token scale, which is what stops screens drifting into twenty slightly
 * different greys.
 *
 * Dynamic Type is left ON (RN's default) so the app respects the reader's
 * system text size; `maxFontSizeMultiplier` caps the extremes on the display
 * faces only, where unbounded scaling would break the layout rather than help.
 */
export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const base = typeScale[variant] as TypeStyle;

  const resolved: TextStyle = {
    ...base,
    color: TONE[tone](colors),
    ...(center ? { textAlign: 'center' } : null),
  };

  const isDisplay = variant === 'display' || variant === 'title' || variant === 'stat';

  return <RNText maxFontSizeMultiplier={isDisplay ? 1.6 : 2.2} {...rest} style={[resolved, style]} />;
}
