import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { PREMIUM_FEATURES } from '@/domain/entitlements';
import { analytics } from '@/lib/analytics';
import { AUTO_RENEW_TERMS, LINKS } from '@/lib/links';
import { purchases, type Package } from '@/lib/purchases';
import { annualSavingPercent, paywallCopy, resolveVariant } from '@/lib/remoteConfig';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

// ---------------------------------------------------------------------------
// Paywall.
//
// App Store guideline 3.1.2 requires, on this screen: the price and period of
// each plan, the free-trial terms, an auto-renew disclosure, links to Terms and
// Privacy, and a Restore Purchases control. All six are present below and
// covered by a test — losing any one of them is a rejection.
//
// Prices come from RevenueCat offerings, never from a remote flag. The flag only
// chooses which headline and ordering to show.
// ---------------------------------------------------------------------------

export default function PaywallScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = params.source ?? 'unknown';

  const setPremium = useStore((s) => s.setPremium);

  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variant = useMemo(() => resolveVariant(analytics()), []);
  const copy = paywallCopy(variant);

  useEffect(() => {
    analytics().capture('paywall_viewed', { source, variant });
    let alive = true;
    purchases()
      .getPackages()
      .then((pkgs) => {
        if (!alive) return;
        setPackages(pkgs);
        // Preselect the highlighted plan so the primary button is always live —
        // a paywall that needs two taps before it can be bought converts worse.
        const preferred = pkgs.find((p) => p.period === copy.highlight) ?? pkgs[0];
        setSelectedId(preferred?.id ?? null);
      })
      .catch(() => {
        if (alive) setPackages([]);
      });
    return () => {
      alive = false;
    };
  }, [source, variant, copy.highlight]);

  const selected = packages?.find((p) => p.id === selectedId) ?? null;
  const monthly = packages?.find((p) => p.period === 'monthly');
  const annual = packages?.find((p) => p.period === 'annual');
  const saving = annualSavingPercent(monthly?.price, annual?.price);

  const dismiss = () => {
    analytics().capture('paywall_dismissed', { source, variant });
    router.back();
  };

  const buy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    analytics().capture('purchase_started', {
      package_id: selected.id,
      period: selected.period,
      variant,
    });
    try {
      const ok = await purchases().purchase(selected.id);
      if (ok) {
        setPremium(true);
        analytics().capture('purchase_completed', {
          package_id: selected.id,
          period: selected.period,
          variant,
          had_trial: Boolean(selected.freeTrialDays),
        });
        router.back();
        return;
      }
      // A cancelled purchase is the common case and is NOT an error state —
      // shouting "failed" at someone who tapped Cancel is hostile.
      analytics().capture('purchase_failed', { package_id: selected.id, reason: 'not-completed' });
      setError('That purchase did not complete. Nothing has been charged.');
    } catch (e) {
      analytics().capture('purchase_failed', {
        package_id: selected.id,
        reason: e instanceof Error ? e.message.slice(0, 80) : 'unknown',
      });
      setError('Something went wrong reaching the store. Nothing has been charged.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await purchases().restore();
      analytics().capture('restore_completed', { restored: ok });
      if (ok) {
        setPremium(true);
        router.back();
      } else {
        setError('No previous purchase was found on this store account.');
      }
    } catch {
      setError('Could not reach the store to restore. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="paywall">
      <View style={styles.topBar}>
        <Pressable
          testID="paywall-close"
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
        >
          <Text variant="heading" tone="tertiary">
            ✕
          </Text>
        </Pressable>
      </View>

      <PageHeader eyebrow="ScentKeep Premium" title={copy.headline} subtitle={copy.subhead} />

      <View style={styles.features}>
        {PREMIUM_FEATURES.map((f) => (
          <View key={f.key} style={styles.feature}>
            <View style={[styles.tick, { backgroundColor: colors.accentBg }]}>
              <Text tone="accent" variant="caption">
                ✓
              </Text>
            </View>
            <View style={styles.fill}>
              <Text variant="subtitle">{f.title}</Text>
              <Text variant="caption" tone="tertiary">
                {f.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {packages === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : packages.length === 0 ? (
        <View style={styles.loading}>
          <Text variant="small" tone="tertiary" center>
            Plans are unavailable right now. Check your connection and try again.
          </Text>
        </View>
      ) : (
        <View style={styles.plans} testID="paywall-plans">
          {packages.map((p) => {
            const active = selectedId === p.id;
            const isAnnual = p.period === 'annual';
            return (
              <Pressable
                key={p.id}
                testID={`plan-${p.period}`}
                onPress={() => setSelectedId(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${p.title}, ${p.priceString}${periodSuffix(p)}${
                  p.freeTrialDays ? `, ${p.freeTrialDays} day free trial` : ''
                }`}
                style={[
                  styles.plan,
                  {
                    backgroundColor: active ? colors.accentBg : colors.surface,
                    borderColor: active ? colors.accent : colors.line,
                    borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={styles.fill}>
                  <View style={styles.planTitleRow}>
                    <Text variant="subtitle" tone={active ? 'accent' : 'default'}>
                      {p.period === 'annual' ? 'Annual' : p.period === 'monthly' ? 'Monthly' : 'Lifetime'}
                    </Text>
                    {isAnnual && saving ? (
                      <View style={[styles.savePill, { backgroundColor: colors.accent }]}>
                        <Text variant="caption" tone="onAccent">
                          Save {saving}%
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="caption" tone="tertiary">
                    {p.freeTrialDays
                      ? `${p.freeTrialDays} days free, then ${p.priceString}${periodSuffix(p)}`
                      : `${p.priceString}${periodSuffix(p)}`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: active ? colors.accent : colors.line },
                    active ? { backgroundColor: colors.accent } : null,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? (
        <Text variant="small" tone="danger" center style={styles.error} testID="paywall-error">
          {error}
        </Text>
      ) : null}

      <Button
        testID="paywall-cta"
        label={selected?.freeTrialDays ? `Start ${selected.freeTrialDays}-day free trial` : copy.ctaLabel}
        onPress={buy}
        disabled={!selected}
        loading={busy}
        size="lg"
        fullWidth
        style={styles.cta}
      />

      <Button
        testID="paywall-restore"
        label="Restore purchases"
        variant="ghost"
        size="sm"
        onPress={restore}
        disabled={busy}
      />

      {/* 3.1.2 disclosure block. Required verbatim-in-substance on the paywall. */}
      <Text variant="caption" tone="faint" style={styles.terms} testID="paywall-terms">
        {selected?.period === 'lifetime'
          ? 'Lifetime is a one-time purchase. It does not renew.'
          : AUTO_RENEW_TERMS}
      </Text>

      <View style={styles.legalRow}>
        <Pressable
          testID="paywall-terms-link"
          onPress={() => WebBrowser.openBrowserAsync(LINKS.terms).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel="Terms of Use"
        >
          <Text variant="caption" tone="tertiary">
            Terms of Use
          </Text>
        </Pressable>
        <Text variant="caption" tone="faint">
          ·
        </Text>
        <Pressable
          testID="paywall-privacy-link"
          onPress={() => WebBrowser.openBrowserAsync(LINKS.privacy).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          <Text variant="caption" tone="tertiary">
            Privacy Policy
          </Text>
        </Pressable>
        <Text variant="caption" tone="faint">
          ·
        </Text>
        <Pressable
          onPress={() =>
            WebBrowser.openBrowserAsync(
              Platform.OS === 'ios' ? LINKS.manageSubscriptionsIos : LINKS.manageSubscriptionsAndroid,
            ).catch(() => {})
          }
          accessibilityRole="link"
          accessibilityLabel="Manage subscription"
        >
          <Text variant="caption" tone="tertiary">
            Manage
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function periodSuffix(p: Package): string {
  if (p.period === 'annual') return '/year';
  if (p.period === 'monthly') return '/month';
  return '';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { alignItems: 'flex-end', marginBottom: space.sm },
  features: { gap: space.lg, marginBottom: space.xxl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tick: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: space.xxl, alignItems: 'center' },
  plans: { gap: space.md, marginBottom: space.lg },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
  },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 3 },
  savePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  radio: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1.5 },
  error: { marginBottom: space.md },
  cta: { marginTop: space.sm },
  terms: { marginTop: space.lg, lineHeight: 16 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
});
