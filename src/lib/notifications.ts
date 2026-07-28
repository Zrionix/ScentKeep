import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { parseReminderTime } from './dates';

// ---------------------------------------------------------------------------
// Local notifications only — no push server, no device tokens, nothing sent off
// the device. That keeps the App Privacy label honest and the app zero-maintenance.
//
// Two nudges (brief §2.6):
//   * the daily "log your Scent of the Day" reminder
//   * an optional weekly "rediscover" nudge for a neglected bottle
// ---------------------------------------------------------------------------

export const DAILY_REMINDER_ID = 'scentkeep-daily-sotd';
export const REDISCOVER_ID = 'scentkeep-rediscover';

/** Copy for the daily nudge. Rotates so it doesn't become wallpaper. */
export const DAILY_MESSAGES: { title: string; body: string }[] = [
  { title: 'What are you wearing today?', body: 'Log your Scent of the Day — it takes one tap.' },
  { title: 'Scent of the Day', body: 'Add today to your diary before you forget what you reached for.' },
  { title: 'Today’s wear', body: 'A tap now, a proper wear history later.' },
  { title: 'Still on your skin?', body: 'Log what you sprayed this morning.' },
];

/** Deterministic pick so the same day always shows the same copy (no flicker
 *  if the reminder is rescheduled twice in one day). */
export function messageForDay(dayIndex: number): { title: string; body: string } {
  const i = ((dayIndex % DAILY_MESSAGES.length) + DAILY_MESSAGES.length) % DAILY_MESSAGES.length;
  return DAILY_MESSAGES[i];
}

export function rediscoverMessage(bottleName: string): { title: string; body: string } {
  return {
    title: 'Neglected on the shelf',
    body: `You haven't worn ${bottleName} in a while. Give it a day?`,
  };
}

export type PermissionResult = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionResult> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Asks only if we haven't been told no — repeated prompts are a rejection risk
 *  and iOS only shows the system sheet once anyway. */
export async function requestPermission(): Promise<PermissionResult> {
  try {
    const current = await getPermission();
    if (current === 'granted') return 'granted';
    if (current === 'denied') return 'denied';
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    /* channel setup is best-effort */
  }
}

/**
 * (Re)schedules the daily SOTD reminder at `time` ("HH:mm").
 * Cancels first so repeated calls can't stack duplicate daily alarms — the
 * classic bug where a user who opens settings five times gets five pings.
 *
 * Returns true when a reminder is now scheduled.
 */
export async function scheduleDailyReminder(time: string, dayIndex = 0): Promise<boolean> {
  const permission = await requestPermission();
  if (permission !== 'granted') return false;

  await cancelDailyReminder();
  await ensureAndroidChannel();

  const { hour, minute } = parseReminderTime(time);
  const { title, body } = messageForDay(dayIndex);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
  } catch {
    /* nothing scheduled is not an error */
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* best effort */
  }
}

/** Applies the user's settings — the single entry point the settings screen and
 *  app bootstrap both call, so scheduled state always matches stored state. */
export async function syncReminders(settings: {
  reminderEnabled: boolean;
  reminderTime: string;
}, dayIndex = 0): Promise<boolean> {
  if (!settings.reminderEnabled) {
    await cancelDailyReminder();
    return false;
  }
  return scheduleDailyReminder(settings.reminderTime, dayIndex);
}

/** Diagnostics for the settings screen and the E2E check. */
export async function scheduledCount(): Promise<number> {
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).length;
  } catch {
    return 0;
  }
}
