import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './backend/database.types';
import { env, integrations } from './env';

// One shared Supabase client for the whole app (multiple GoTrue instances fight
// over the same storage key and silently drop sessions). Returns null when
// Supabase isn't configured, which is the signal to run in local-only mode.
let client: SupabaseClient<Database> | null | undefined;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  if (!integrations.supabase) {
    client = null;
    return client;
  }
  client = createClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // required on native — there is no URL to parse
    },
  });
  return client;
}

/** Test seam: drop the memoised client so a suite can re-evaluate env. */
export function __resetSupabaseClientForTesting(): void {
  client = undefined;
}
