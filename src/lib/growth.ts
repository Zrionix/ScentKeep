import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useEffect } from 'react';

const PAYWALL = 'growth.paywallSeen';
const FIRST = 'growth.firstOpenAt';
const OPENS = 'growth.openCount';
const REVIEW = 'growth.reviewAsked';

export async function markPaywallSeen(): Promise<void> {
  await AsyncStorage.setItem(PAYWALL, '1');
}

export async function hasSeenPaywall(): Promise<boolean> {
  return (await AsyncStorage.getItem(PAYWALL)) === '1';
}

export async function noteAppOpen(): Promise<number> {
  const first = await AsyncStorage.getItem(FIRST);
  if (!first) await AsyncStorage.setItem(FIRST, String(Date.now()));
  const n = Number((await AsyncStorage.getItem(OPENS)) ?? '0') + 1;
  await AsyncStorage.setItem(OPENS, String(n));
  return n;
}

export function useMarkPaywallSeenOnMount(): void {
  useEffect(() => {
    markPaywallSeen().catch(() => {});
  }, []);
}

/** Apple/Google own the dialog. We ask once, after 3 days and 4 opens, never on first launch. */
export async function maybeAskReview(): Promise<void> {
  if ((await AsyncStorage.getItem(REVIEW)) === '1') return;
  const first = Number((await AsyncStorage.getItem(FIRST)) ?? '0');
  const opens = Number((await AsyncStorage.getItem(OPENS)) ?? '0');
  if (!first || Date.now() - first < 3 * 24 * 60 * 60 * 1000) return;
  if (opens < 4) return;
  try {
    if (!(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(REVIEW, '1');
    await StoreReview.requestReview();
  } catch {
    /* store review is best-effort */
  }
}
