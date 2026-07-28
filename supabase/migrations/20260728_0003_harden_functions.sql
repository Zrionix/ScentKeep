-- ============================================================================
-- ScentKeep — function hardening.
--
-- Supabase's linter flagged `public.handle_new_user()`: because it lives in the
-- exposed `public` schema and is SECURITY DEFINER, PostgREST published it at
-- /rest/v1/rpc/handle_new_user, callable by `anon` and `authenticated`. Called
-- directly it runs as the definer (superuser-ish) with an attacker-controlled
-- trigger record — exactly the escalation shape you don't want reachable from a
-- public API.
--
-- Revoking EXECUTE is safe for a trigger function: Postgres checks EXECUTE
-- permission when the trigger is CREATED, not each time it fires. The existing
-- on_auth_user_created trigger keeps working; only the RPC route closes.
-- ============================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- `billing_events` intentionally has RLS ON and ZERO policies. In Postgres that
-- is a deny-all: no anon or authenticated request can read or write it. Only the
-- service-role key (which bypasses RLS) touches it, from the RevenueCat webhook
-- Edge Function. The linter reports this as INFO; it is the desired posture.
comment on table public.billing_events is
  'Webhook idempotency ledger. RLS on with no policies = deny-all to clients by design; written only by the service-role RevenueCat webhook.';
