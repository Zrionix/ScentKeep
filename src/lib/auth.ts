import { getSupabaseClient } from './supabaseClient';

// ---------------------------------------------------------------------------
// Anonymous-first auth (brief §5). A user gets an identity on first launch
// without typing anything — no email, no password, nothing to collect. Email is
// only ever an OPTIONAL upgrade, for syncing to a second device.
//
// Every function here is total: if Supabase isn't configured, or the network is
// down, it resolves to null rather than throwing. The app is fully usable with
// no account at all, so auth failing must never block a launch.
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
  email: string | null;
}

function toAuthUser(user: { id: string; email?: string | null; is_anonymous?: boolean } | null | undefined): AuthUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    isAnonymous: Boolean(user.is_anonymous) || !user.email,
    email: user.email ?? null,
  };
}

/** The current session's user, or null when signed out / unconfigured. */
export async function currentUser(): Promise<AuthUser | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return toAuthUser(data.user as never);
  } catch {
    return null;
  }
}

/**
 * Ensures there is a session, creating an anonymous one if needed.
 * Returns null when Supabase is unconfigured or unreachable — the caller then
 * runs in local-only mode, which is a perfectly good state, not an error.
 */
export async function ensureSession(): Promise<AuthUser | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const existing = await supabase.auth.getSession();
    const sessionUser = toAuthUser(existing.data.session?.user as never);
    if (sessionUser) return sessionUser;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return null;
    return toAuthUser(data.user as never);
  } catch {
    return null;
  }
}

/**
 * Upgrades an anonymous account to an email one, keeping the SAME user id — so
 * every existing row stays attached and nothing needs migrating.
 */
export async function linkEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured in this build.' };
  try {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not link that email.' };
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* already gone is fine */
  }
}

/**
 * Deletes the account and every row that hangs off it. Requires the
 * `delete-account` Edge Function (service-role); the FK cascades from
 * auth.users do the actual removal, which is what makes the deletion complete
 * rather than leaving orphaned rows behind.
 */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true }; // nothing in the cloud to delete
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) return { ok: false, error: error.message };
    await signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not delete the account.' };
  }
}
