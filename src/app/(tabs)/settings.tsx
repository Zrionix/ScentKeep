import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { DateTime } from 'luxon';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader, Screen, SectionHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { FREE_LIMITS } from '@/domain/entitlements';
import { analytics } from '@/lib/analytics';
import { deleteAccount } from '@/lib/auth';
import { buildExport, exportFilename, serialiseExport } from '@/lib/dataRights';
import { formatReminderTime, parseReminderTime } from '@/lib/dates';
import { integrationsSummary } from '@/lib/env';
import { LINKS } from '@/lib/links';
import { syncReminders } from '@/lib/notifications';
import { purchases } from '@/lib/purchases';
import { purgeCloud } from '@/lib/sync';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

const REMINDER_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '20:00', '21:00'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const settings = useStore((s) => s.settings);
  const isPremium = useStore((s) => s.isPremium);
  const userId = useStore((s) => s.userId);
  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const updateSettings = useStore((s) => s.updateSettings);
  const clearAll = useStore((s) => s.clearAll);
  const setPremium = useStore((s) => s.setPremium);

  const [busy, setBusy] = useState(false);

  const setReminderEnabled = async (enabled: boolean) => {
    updateSettings({ reminderEnabled: enabled });
    const ok = await syncReminders({ ...settings, reminderEnabled: enabled });
    if (enabled && !ok) {
      // Reflect reality: if the OS refused, the toggle must not claim it is on.
      updateSettings({ reminderEnabled: false });
      Alert.alert(
        'Notifications are off',
        'ScentKeep needs notification permission to remind you. You can turn it on in your device Settings.',
      );
      return;
    }
    analytics().capture(enabled ? 'reminder_scheduled' : 'reminder_disabled', enabled ? { time: settings.reminderTime } : {});
  };

  const setReminderTime = async (time: string) => {
    updateSettings({ reminderTime: time });
    if (settings.reminderEnabled) {
      await syncReminders({ ...settings, reminderTime: time });
      analytics().capture('reminder_scheduled', { time });
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const doc = buildExport({ fragrances, sotd, settings }, DateTime.utc().toISO()!);
      const json = serialiseExport(doc);
      const name = exportFilename(doc.exportedAt);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Export', 'Sharing is not available on this device.');
        return;
      }
      // SDK 57 file API. `overwrite` matters: exporting twice on the same day
      // reuses the filename, and without it the second export would throw.
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true });
      file.write(json);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export ScentKeep data',
      });
      analytics().capture('data_exported', {});
    } catch {
      Alert.alert('Export', 'Could not create the export file. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteEverything = () =>
    Alert.alert(
      'Delete everything?',
      'This permanently removes your collection, your diary and your account. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await purgeCloud(userId);
              await deleteAccount();
              clearAll();
              analytics().capture('account_deleted', {});
              Alert.alert('Deleted', 'Your data has been removed from this device and from our servers.');
            } catch {
              Alert.alert('Delete', 'Some data could not be removed. Please contact support.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const restore = async () => {
    setBusy(true);
    try {
      const ok = await purchases().restore();
      analytics().capture('restore_completed', { restored: ok });
      setPremium(ok);
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'Premium is active on this device.' : 'No previous purchase was found on this store account.',
      );
    } catch {
      Alert.alert('Restore', 'Could not reach the store. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="settings">
      <PageHeader eyebrow="ScentKeep" title="Settings" />

      {!isPremium ? (
        <Card
          testID="settings-upgrade"
          onPress={() => router.push({ pathname: '/paywall', params: { source: 'settings' } })}
          style={[styles.upgrade, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
          accessibilityLabel="Upgrade to ScentKeep Premium"
        >
          <Text variant="overline" tone="accent">
            ScentKeep Premium
          </Text>
          <Text variant="subtitle" style={styles.upgradeTitle}>
            Unlimited wardrobe, full insights, cloud backup
          </Text>
          <Text variant="caption" tone="tertiary">
            Free keeps {FREE_LIMITS.wardrobe} bottles and {FREE_LIMITS.sotdHistoryDays} days of diary.
          </Text>
        </Card>
      ) : (
        <Card flat testID="settings-premium-active" style={styles.upgrade}>
          <Text variant="overline" tone="accent">
            Premium active
          </Text>
          <Text variant="small" tone="secondary" style={styles.upgradeTitle}>
            Thank you — everything is unlocked and your collection is backed up.
          </Text>
        </Card>
      )}

      <SectionHeader title="Daily reminder" />
      <Card>
        <View style={styles.switchRow}>
          <View style={styles.fill}>
            <Text variant="subtitle">Remind me to log</Text>
            <Text variant="caption" tone="tertiary">
              A gentle nudge at {formatReminderTime(settings.reminderTime)}
            </Text>
          </View>
          <Switch
            testID="reminder-switch"
            value={settings.reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ true: colors.accent, false: colors.surface3 }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
            accessibilityLabel="Daily reminder"
          />
        </View>

        {settings.reminderEnabled ? (
          <View style={styles.chipRow}>
            {REMINDER_TIMES.map((t) => {
              const active = parseReminderTime(settings.reminderTime).hour === parseReminderTime(t).hour;
              return (
                <Pressable
                  key={t}
                  testID={`reminder-time-${t}`}
                  onPress={() => setReminderTime(t)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={formatReminderTime(t)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.accentBg : colors.surface2,
                      borderColor: active ? colors.accentLine : colors.line,
                    },
                  ]}
                >
                  <Text variant="caption" tone={active ? 'accent' : 'secondary'}>
                    {formatReminderTime(t)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Appearance" />
      <Card>
        <View style={styles.chipRow}>
          {(['system', 'dark', 'light'] as const).map((t) => {
            const active = settings.themePreference === t;
            return (
              <Pressable
                key={t}
                testID={`theme-${t}`}
                onPress={() => updateSettings({ themePreference: t })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accentBg : colors.surface2,
                    borderColor: active ? colors.accentLine : colors.line,
                  },
                ]}
              >
                <Text variant="caption" tone={active ? 'accent' : 'secondary'}>
                  {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Currency" />
      <Card>
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => {
            const active = settings.currency === c;
            return (
              <Pressable
                key={c}
                testID={`currency-${c}`}
                onPress={() => updateSettings({ currency: c })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accentBg : colors.surface2,
                    borderColor: active ? colors.accentLine : colors.line,
                  },
                ]}
              >
                <Text variant="caption" tone={active ? 'accent' : 'secondary'}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" tone="faint" style={styles.hint}>
          Used to display collection value. It does not convert existing prices.
        </Text>
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Button
          testID="settings-export"
          label="Export my data"
          variant="secondary"
          fullWidth
          loading={busy}
          onPress={exportData}
        />
        <Text variant="caption" tone="faint" style={styles.hint}>
          A complete JSON file with every bottle, diary entry and setting.
        </Text>
        <Button
          testID="settings-delete"
          label="Delete everything"
          variant="danger"
          fullWidth
          style={styles.dangerButton}
          disabled={busy}
          onPress={confirmDeleteEverything}
        />
      </Card>

      <SectionHeader title="Purchases" />
      <Card>
        <Button
          testID="settings-restore"
          label="Restore purchases"
          variant="secondary"
          fullWidth
          loading={busy}
          onPress={restore}
        />
        {isPremium ? (
          <Button
            label="Manage subscription"
            variant="ghost"
            fullWidth
            style={styles.dangerButton}
            onPress={() =>
              WebBrowser.openBrowserAsync(
                Platform.OS === 'ios' ? LINKS.manageSubscriptionsIos : LINKS.manageSubscriptionsAndroid,
              ).catch(() => {})
            }
          />
        ) : null}
      </Card>

      <SectionHeader title="About" />
      <Card padded={false}>
        {[
          { label: 'Privacy Policy', url: LINKS.privacy, testID: 'link-privacy' },
          { label: 'Terms of Use', url: LINKS.terms, testID: 'link-terms' },
          { label: 'Support', url: LINKS.support, testID: 'link-support' },
        ].map((l, i) => (
          <Pressable
            key={l.label}
            testID={l.testID}
            onPress={() => WebBrowser.openBrowserAsync(l.url).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={l.label}
            style={[
              styles.linkRow,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft } : null,
            ]}
          >
            <Text variant="small">{l.label}</Text>
            <Text tone="faint">›</Text>
          </Pressable>
        ))}
      </Card>

      <Text variant="caption" tone="faint" center style={styles.version}>
        ScentKeep 1.0.0
        {__DEV__ ? `\n${integrationsSummary()}` : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  upgrade: { borderWidth: 1 },
  upgradeTitle: { marginTop: 4, marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { marginTop: space.md },
  dangerButton: { marginTop: space.md },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  version: { marginTop: space.xxl },
});
