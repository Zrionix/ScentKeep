// ---------------------------------------------------------------------------
// Delete-my-data (brief §5; App Store guideline 5.1.1(v) requires in-app
// account deletion for any app that supports account creation).
//
// Deleting the auth.users row is sufficient and is the point: every user table
// carries `ON DELETE CASCADE` to auth.users, so one delete removes profiles,
// fragrances, sotd_entries, settings and subscriptions atomically. Deleting the
// tables one by one would risk leaving something behind as the schema grows.
//
// Identity comes from admin.auth.getUser(jwt) — the token is VERIFIED against
// Supabase, never merely decoded. Trusting a decoded `sub` claim would let
// anyone delete anyone's account by hand-crafting a token.
// ---------------------------------------------------------------------------

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'missing token' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // VERIFY the token rather than decoding it. This is the whole security
  // boundary of the function.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) {
    return new Response(JSON.stringify({ error: 'invalid token' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const userId = data.user.id;

  // Photos live outside Postgres, so the cascade cannot reach them — remove the
  // user's storage folder explicitly or their images would outlive the account.
  try {
    const { data: files } = await admin.storage.from('bottle-photos').list(userId);
    if (files?.length) {
      await admin.storage.from('bottle-photos').remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    // A storage hiccup must not block the account deletion itself.
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: 'delete failed' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
