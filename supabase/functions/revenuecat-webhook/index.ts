// ---------------------------------------------------------------------------
// RevenueCat -> Supabase entitlement mirror.
//
// RevenueCat is the authority on what a user has paid for. This function is the
// ONLY thing that writes `subscriptions`, using the service-role key; the table
// has no client write policy, so a tampered app cannot grant itself premium.
//
// verify_jwt = false: the caller is RevenueCat's server, which has no Supabase
// JWT. The shared secret in the Authorization header IS the authentication, and
// it is compared in constant time.
// ---------------------------------------------------------------------------

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

/** Constant-time compare that does not short-circuit on differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i += 1) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function statusFor(type: string, expirationMs: number | null): string {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'NON_RENEWING_PURCHASE':
    case 'SUBSCRIPTION_EXTENDED':
      return 'active';
    case 'TRIAL_STARTED':
      return 'trial';
    case 'BILLING_ISSUE':
      return 'grace';
    case 'SUBSCRIPTION_PAUSED':
      return 'paused';
    case 'EXPIRATION':
      return 'expired';
    case 'CANCELLATION':
      // A cancellation is NOT an immediate loss of access — the user keeps it
      // until the period ends. Downgrading here would cut off someone who has
      // already paid for the rest of the month.
      return expirationMs && expirationMs > Date.now() ? 'active' : 'expired';
    default:
      return 'inactive';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Fail CLOSED: an unset secret rejects everything rather than accepting
  // everything, which is what a naive `if (secret && ...)` check would do.
  const auth = req.headers.get('Authorization') ?? '';
  if (!WEBHOOK_SECRET || !safeEqual(auth, WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const event = payload?.event;
  const eventId: string | undefined = event?.id;
  const appUserId: string | undefined = event?.app_user_id;

  if (!eventId || !appUserId) {
    // 400, not 500: this delivery is malformed and retrying will not fix it.
    return new Response(JSON.stringify({ error: 'missing event id or app_user_id' }), { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- idempotency -----------------------------------------------------------
  // The ledger is keyed on RevenueCat's own event id, so a replayed delivery
  // collides here.
  //
  // A collision alone is NOT proof the event was fully handled: the previous
  // attempt may have written the ledger and then failed on the subscription
  // upsert, returning 5xx. Treating every collision as "already done" would drop
  // that entitlement change permanently. So on a collision we check whether the
  // subscription row actually carries this event id, and only short-circuit if
  // it does.
  const { error: ledgerError } = await admin
    .from('billing_events')
    .insert({ event_id: eventId, user_id: appUserId, event_type: event.type, payload });

  if (ledgerError) {
    if (ledgerError.code !== '23505') {
      // A real storage failure: 5xx so RevenueCat retries rather than dropping
      // an entitlement change on the floor.
      return new Response(JSON.stringify({ error: 'ledger write failed' }), { status: 500 });
    }

    const { data: existing } = await admin
      .from('subscriptions')
      .select('last_event_id')
      .eq('user_id', appUserId)
      .maybeSingle();

    if (existing?.last_event_id === eventId) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Ledger row exists but the entitlement was never applied — fall through and
    // finish the job. The upsert below is idempotent.
  }

  // --- ordering guard --------------------------------------------------------
  // RevenueCat does not guarantee ordering, so a retried EXPIRATION can arrive
  // after a newer RENEWAL. Applying it would revoke an entitlement the user has
  // already renewed.
  const eventAtMs: number | null = event.event_timestamp_ms ?? null;
  const eventAt = eventAtMs ? new Date(eventAtMs).toISOString() : null;

  if (eventAt) {
    const { data: current } = await admin
      .from('subscriptions')
      .select('last_event_at')
      .eq('user_id', appUserId)
      .maybeSingle();

    if (current?.last_event_at && current.last_event_at > eventAt) {
      return new Response(JSON.stringify({ ok: true, stale: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const expirationMs: number | null = event.expiration_at_ms ?? null;
  const status = statusFor(String(event.type), expirationMs);

  const { error: upsertError } = await admin.from('subscriptions').upsert(
    {
      user_id: appUserId,
      entitlement: event.entitlement_id ?? event.entitlement_ids?.[0] ?? 'premium',
      status,
      product_id: event.product_id ?? null,
      store: event.store ?? null,
      period_type: event.period_type ?? null,
      expires_at: expirationMs ? new Date(expirationMs).toISOString() : null,
      last_event_id: eventId,
      last_event_at: eventAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (upsertError) {
    return new Response(JSON.stringify({ error: 'subscription write failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
