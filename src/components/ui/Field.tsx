import React from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { radius, space, type as typeScale } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Validation message. Presence switches the field to its error treatment. */
  error?: string;
  /** Quiet helper text under the field. */
  hint?: string;
  multiline?: boolean;
  required?: boolean;
  testID?: string;
}

export function Field({ label, error, hint, multiline, required, testID, ...rest }: FieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <Text variant="overline" tone="tertiary" style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        // The error text is announced with the field rather than as a separate
        // node, so a screen-reader user hears WHY the field is flagged.
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.ink4}
        multiline={multiline}
        {...rest}
        style={[
          styles.input,
          typeScale.body,
          {
            color: colors.ink,
            backgroundColor: colors.surface2,
            borderColor: error ? colors.danger : colors.line,
            minHeight: multiline ? 96 : 48,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {error ? (
        <Text variant="caption" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Numeric field that keeps its own text state, so a half-typed "12." isn't
 * destroyed by a parse round-trip on every keystroke. Emits null for empty and
 * NaN for unparseable, which `validateFragrance` then reports properly rather
 * than silently coercing to 0.
 */
export function NumberField({
  label,
  value,
  onChangeNumber,
  error,
  hint,
  prefix,
  suffix,
  testID,
  ...rest
}: Omit<FieldProps, 'onChangeText' | 'value'> & {
  value: number | null;
  onChangeNumber: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
}) {
  const [text, setText] = React.useState(value === null ? '' : String(value));
  const [syncedValue, setSyncedValue] = React.useState(value);

  // Adjusting state during render (React's documented pattern for "a prop
  // changed") rather than in an effect, which would cascade an extra render on
  // every keystroke.
  if (value !== syncedValue) {
    setSyncedValue(value);
    const parsedText = text.trim() === '' ? null : Number(text);
    // Only overwrite the field when the new value came from OUTSIDE. If the
    // current text already parses to it, the user typed it — and a half-typed
    // "12." must survive its own onChangeNumber(12) round-trip.
    if (parsedText !== value) setText(value === null ? '' : String(value));
  }

  return (
    <Field
      label={suffix ? `${label} (${suffix})` : label}
      error={error}
      hint={hint}
      testID={testID}
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={prefix && text ? `${prefix}${text}` : text}
      onChangeText={(raw) => {
        const cleaned = raw.replace(prefix ?? '', '').replace(/[^0-9.]/g, '');
        setText(cleaned);
        if (cleaned.trim() === '') onChangeNumber(null);
        else onChangeNumber(Number(cleaned));
      }}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { marginBottom: 7 },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  helper: { marginTop: 6 },
});
