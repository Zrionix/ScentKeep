-- ============================================================================
-- ScentKeep — webhook ordering guard.
--
-- RevenueCat retries any non-2xx delivery and does NOT guarantee ordering, so
-- a retried EXPIRATION can arrive after a newer RENEWAL. The webhook previously
-- upserted unconditionally, which meant a late, stale event could revoke an
-- entitlement the user had already renewed.
--
-- Recording the event's own timestamp lets the handler ignore anything older
-- than what it has already applied.
-- ============================================================================

alter table public.subscriptions
  add column if not exists last_event_at timestamptz;

comment on column public.subscriptions.last_event_at is
  'event_timestamp_ms of the RevenueCat event that produced this row. The webhook ignores any event older than this, so out-of-order retries cannot revoke a newer entitlement.';
