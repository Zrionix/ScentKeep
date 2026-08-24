import { DEFAULT_SETTINGS } from '@/domain/types';
import { useStore } from '@/state/store';
import { bootstrap } from './bootstrap';
import { syncReminders } from './notifications';

// ---------------------------------------------------------------------------
// Startup must never leave the reminder switch claiming something untrue.
//
// bootstrap() used to call syncReminders() and discard the boolean it returns.
// syncReminders returns false when the OS refuses permission, so after a denial
// `reminderEnabled` stayed true with nothing scheduled — and Settings rendered
// the switch ON, captioned "A gentle nudge at 9:00 AM", for a user who would
// never receive one.
//
// Everything else bootstrap touches is stubbed to a no-op. This suite is about
// step 4 and nothing else; the other steps have their own.
// ---------------------------------------------------------------------------

jest.mock('./auth', () => ({ ensureSession: jest.fn().mockResolvedValue(null) }));
jest.mock('./sync', () => ({ syncNow: jest.fn().mockResolvedValue({ ok: false }) }));
jest.mock('./notifications', () => ({ syncReminders: jest.fn() }));
jest.mock('./analytics', () => ({
  analytics: () => ({
    identify: jest.fn(),
    setPremium: jest.fn(),
    reloadFlags: jest.fn().mockResolvedValue(undefined),
    capture: jest.fn(),
  }),
}));
jest.mock('./purchases', () => ({
  purchases: () => ({
    configure: jest.fn().mockResolvedValue(undefined),
    isPremium: jest.fn().mockResolvedValue(false),
  }),
}));

const mockedSync = syncReminders as jest.MockedFunction<typeof syncReminders>;

const setSettings = (patch: Partial<typeof DEFAULT_SETTINGS>) =>
  useStore.setState({ settings: { ...DEFAULT_SETTINGS, ...patch } });

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState({ fragrances: [], sotd: [], userId: null, isPremium: false });
  setSettings({});
});

describe('reminders at startup', () => {
  it('does not touch notifications when the toggle is off', async () => {
    setSettings({ reminderEnabled: false });
    await bootstrap();
    // The important half: no syncReminders call means no requestPermission
    // call, which means iOS does not burn its one permission sheet on a user
    // who has not yet seen a bottle.
    expect(mockedSync).not.toHaveBeenCalled();
    expect(useStore.getState().settings.reminderEnabled).toBe(false);
  });

  it('re-arms the schedule when the toggle is on and the OS agrees', async () => {
    mockedSync.mockResolvedValue(true);
    setSettings({ reminderEnabled: true });
    await bootstrap();
    expect(mockedSync).toHaveBeenCalledTimes(1);
    expect(useStore.getState().settings.reminderEnabled).toBe(true);
  });

  it('turns the toggle OFF when the OS refuses', async () => {
    // THE REGRESSION. Permission revoked in iOS Settings between launches.
    mockedSync.mockResolvedValue(false);
    setSettings({ reminderEnabled: true });
    await bootstrap();
    expect(useStore.getState().settings.reminderEnabled).toBe(false);
  });

  it('does not re-offer the prompt just because the toggle went off', async () => {
    // Turning the switch off must not read as "never asked" — otherwise the
    // next log offers reminders again to someone who already declined at the
    // system sheet, where the answer cannot change without a reinstall.
    mockedSync.mockResolvedValue(false);
    setSettings({ reminderEnabled: true, reminderPromptedAt: '2026-02-02T09:00:00.000Z' });
    await bootstrap();
    const s = useStore.getState().settings;
    expect(s.reminderEnabled).toBe(false);
    expect(s.reminderPromptedAt).toBe('2026-02-02T09:00:00.000Z');
  });

  it('still boots when notifications throw outright', async () => {
    mockedSync.mockRejectedValue(new Error('no notification service'));
    setSettings({ reminderEnabled: true });
    await expect(bootstrap()).resolves.toMatchObject({ isPremium: false });
  });
});
