import * as Notifications from 'expo-notifications';
import {
  DAILY_MESSAGES,
  DAILY_REMINDER_ID,
  cancelDailyReminder,
  getPermission,
  messageForDay,
  rediscoverMessage,
  requestPermission,
  scheduleDailyReminder,
  syncReminders,
} from './notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

// `clearAllMocks` wipes recorded calls but KEEPS implementations, so a
// `mockRejectedValue` set by one test leaks into the next. `resetAllMocks` drops
// the implementations too, and every one this suite depends on is re-declared
// here — so each test starts from the same known-good baseline.
beforeEach(() => {
  jest.resetAllMocks();
  mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocked.scheduleNotificationAsync.mockResolvedValue('notification-id' as never);
  mocked.cancelScheduledNotificationAsync.mockResolvedValue(undefined as never);
  mocked.cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined as never);
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([] as never);
  mocked.setNotificationChannelAsync.mockResolvedValue(undefined as never);
});

describe('message copy', () => {
  it('rotates deterministically and wraps around', () => {
    expect(messageForDay(0)).toEqual(DAILY_MESSAGES[0]);
    expect(messageForDay(DAILY_MESSAGES.length)).toEqual(DAILY_MESSAGES[0]);
    expect(messageForDay(5)).toEqual(messageForDay(5));
  });

  it('handles a negative day index without crashing', () => {
    expect(DAILY_MESSAGES).toContainEqual(messageForDay(-1));
  });

  it('names the bottle in the rediscover nudge', () => {
    expect(rediscoverMessage('Oud Wood').body).toContain('Oud Wood');
  });
});

describe('permission', () => {
  it('reports the current grant state', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await getPermission()).toBe('denied');
  });

  it('treats an unknown status as undetermined', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'something-else' } as never);
    expect(await getPermission()).toBe('undetermined');
  });

  it('does not re-prompt when permission is already granted', async () => {
    await requestPermission();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not re-prompt after an explicit denial', async () => {
    // iOS only shows the system sheet once; nagging is a review risk and a no-op.
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await requestPermission()).toBe('denied');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when undetermined', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never);
    expect(await requestPermission()).toBe('granted');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('degrades to undetermined if the permissions API throws', async () => {
    mocked.getPermissionsAsync.mockRejectedValue(new Error('no native module'));
    expect(await getPermission()).toBe('undetermined');
  });
});

describe('scheduleDailyReminder', () => {
  it('schedules a daily trigger at the requested local time', async () => {
    expect(await scheduleDailyReminder('07:30')).toBe(true);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: DAILY_REMINDER_ID,
        trigger: expect.objectContaining({ hour: 7, minute: 30 }),
      }),
    );
  });

  it('cancels the existing reminder first so alarms cannot stack', async () => {
    // Opening settings five times must not produce five daily pings.
    await scheduleDailyReminder('09:00');
    await scheduleDailyReminder('10:00');
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('uses a fixed identifier so every reschedule replaces the same alarm', async () => {
    await scheduleDailyReminder('09:00');
    const arg = mocked.scheduleNotificationAsync.mock.calls[0][0] as any;
    expect(arg.identifier).toBe(DAILY_REMINDER_ID);
  });

  it('falls back to 09:00 for a malformed time instead of throwing', async () => {
    await scheduleDailyReminder('99:99');
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ hour: 9, minute: 0 }) }),
    );
  });

  it('does not schedule when permission is refused', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await scheduleDailyReminder('09:00')).toBe(false);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing if scheduling errors', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('scheduler unavailable'));
    expect(await scheduleDailyReminder('09:00')).toBe(false);
  });
});

describe('syncReminders', () => {
  it('schedules when reminders are on', async () => {
    expect(await syncReminders({ reminderEnabled: true, reminderTime: '08:15' })).toBe(true);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('cancels and schedules nothing when reminders are off', async () => {
    expect(await syncReminders({ reminderEnabled: false, reminderTime: '08:15' })).toBe(false);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('cancelDailyReminder', () => {
  it('swallows the error when nothing is scheduled', async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValue(new Error('not found'));
    await expect(cancelDailyReminder()).resolves.toBeUndefined();
  });
});
