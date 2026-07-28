/* eslint-disable */
/**
 * RLS cross-user denial test (brief §5/§8 — mandatory).
 *
 * Signs in TWO real anonymous users against the live Supabase project and
 * proves that user B cannot read, modify, or delete anything belonging to user
 * A — and cannot grant itself premium. This runs against the real database
 * because RLS is a database behaviour: a mock would only prove the mock works.
 *
 *   node scripts/test-rls.js
 *
 * Requires EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY (from .env).
 * SUPABASE_ACCESS_TOKEN is optional and used only to clean up the test users
 * afterwards; the secret is read from the environment, never written to disk.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- load .env (no dotenv dependency) ---------------------------------------
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function client() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signInAnon(label) {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(`${label} sign-in failed: ${error.message}`);
  return { client: c, userId: data.user.id };
}

async function main() {
  console.log('RLS cross-user denial test\n');

  const A = await signInAnon('user A');
  const B = await signInAnon('user B');
  console.log(`  user A: ${A.userId.slice(0, 8)}…`);
  console.log(`  user B: ${B.userId.slice(0, 8)}…\n`);
  check('two distinct anonymous users were created', A.userId !== B.userId);

  // --- A creates data -------------------------------------------------------
  const { data: aFrag, error: aErr } = await A.client
    .from('fragrances')
    .insert({ user_id: A.userId, name: 'A Secret Bottle', brand: 'Private House', price: 999 })
    .select()
    .single();
  check("A can insert its own bottle", !aErr && !!aFrag, aErr?.message);
  if (!aFrag) {
    console.log('\nCannot continue without A\'s row.');
    process.exit(1);
  }

  const { error: aSotdErr } = await A.client
    .from('sotd_entries')
    .insert({ user_id: A.userId, fragrance_id: aFrag.id, date: '2026-07-28', note: 'A private note' });
  check('A can log its own diary entry', !aSotdErr, aSotdErr?.message);

  // --- B tries to read A ----------------------------------------------------
  const { data: bList } = await B.client.from('fragrances').select('*');
  check(
    "B's unfiltered list does not contain A's bottle",
    !(bList ?? []).some((f) => f.id === aFrag.id),
    `B saw ${(bList ?? []).length} rows`,
  );

  const { data: bTargeted } = await B.client.from('fragrances').select('*').eq('id', aFrag.id);
  check("B cannot read A's bottle by its exact id", (bTargeted ?? []).length === 0);

  const { data: bSotd } = await B.client.from('sotd_entries').select('*');
  check("B cannot read A's diary entries", (bSotd ?? []).length === 0);

  // --- B tries to write A ---------------------------------------------------
  const { data: bUpdate } = await B.client
    .from('fragrances')
    .update({ name: 'HIJACKED' })
    .eq('id', aFrag.id)
    .select();
  check("B's update of A's bottle affects zero rows", (bUpdate ?? []).length === 0);

  const { data: bDelete } = await B.client.from('fragrances').delete().eq('id', aFrag.id).select();
  check("B's delete of A's bottle affects zero rows", (bDelete ?? []).length === 0);

  // The row must still be intact and unchanged from A's side.
  const { data: aReread } = await A.client.from('fragrances').select('*').eq('id', aFrag.id).single();
  check("A's bottle still exists after B's attempts", !!aReread);
  check("A's bottle name was not modified by B", aReread?.name === 'A Secret Bottle', aReread?.name);

  // --- B tries to impersonate A --------------------------------------------
  const { error: spoofErr } = await B.client
    .from('fragrances')
    .insert({ user_id: A.userId, name: 'Planted by B' });
  check("B cannot insert a row owned by A", !!spoofErr, spoofErr ? undefined : 'insert succeeded!');

  // The composite FK on sotd_entries must stop B attaching a diary entry to a
  // bottle it does not own, even with its OWN user_id on the row.
  const { error: fkErr } = await B.client
    .from('sotd_entries')
    .insert({ user_id: B.userId, fragrance_id: aFrag.id, date: '2026-07-28' });
  check(
    "B cannot log a diary entry against A's bottle",
    !!fkErr,
    fkErr ? undefined : 'insert succeeded!',
  );

  // --- entitlement tables ---------------------------------------------------
  const { error: subErr } = await B.client
    .from('subscriptions')
    .insert({ user_id: B.userId, entitlement: 'premium', status: 'active' });
  check(
    'B cannot grant itself premium by writing to subscriptions',
    !!subErr,
    subErr ? undefined : 'insert succeeded!',
  );

  const { data: subRead } = await B.client.from('subscriptions').select('*').eq('user_id', A.userId);
  check("B cannot read A's subscription row", (subRead ?? []).length === 0);

  const { data: events, error: eventsErr } = await B.client.from('billing_events').select('*');
  check(
    'B cannot read the billing event ledger',
    !!eventsErr || (events ?? []).length === 0,
    `${(events ?? []).length} rows`,
  );

  // --- settings / profiles --------------------------------------------------
  const { data: bSettings } = await B.client.from('settings').select('*');
  check(
    "B sees only its own settings row",
    (bSettings ?? []).every((s) => s.user_id === B.userId),
    `${(bSettings ?? []).length} rows`,
  );

  const { data: bProfiles } = await B.client.from('profiles').select('*');
  check(
    "B sees only its own profile row",
    (bProfiles ?? []).every((p) => p.id === B.userId),
    `${(bProfiles ?? []).length} rows`,
  );

  // --- storage --------------------------------------------------------------
  const { data: bFiles } = await B.client.storage.from('bottle-photos').list(A.userId);
  check("B cannot list A's photo folder", !bFiles || bFiles.length === 0);

  // --- cleanup --------------------------------------------------------------
  await A.client.from('fragrances').delete().eq('id', aFrag.id);
  await cleanupUsers([A.userId, B.userId]);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

/** Removes the throwaway anonymous users so they don't accumulate in auth. */
async function cleanupUsers(ids) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    console.log('\n  (skipping user cleanup — SUPABASE_ACCESS_TOKEN not set)');
    return;
  }
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const keys = await res.json();
    const serviceRole = (Array.isArray(keys) ? keys : []).find(
      (k) => k.name === 'service_role' || k.type === 'secret',
    )?.api_key;
    if (!serviceRole) return;

    const admin = createClient(URL, serviceRole, { auth: { persistSession: false } });
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    console.log('\n  (test users cleaned up)');
  } catch {
    console.log('\n  (user cleanup skipped)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
