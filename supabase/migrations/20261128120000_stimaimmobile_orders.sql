-- Paid valuations: every estimate is now an order owned by a Supabase Auth user.
-- Value and PDF are released by the API only when status = 'paid'.
create table stimaimmobile.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null check (length(email) between 3 and 254),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = 'eur'),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  consent_at timestamptz not null,
  stripe_session_id text unique,
  notes text not null default '' check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_user_created_at on stimaimmobile.orders(user_id, created_at desc);
create index orders_status_created_at on stimaimmobile.orders(status, created_at desc);

alter table stimaimmobile.orders enable row level security;
grant select, insert, update on stimaimmobile.orders to stimaimmobile_app;
-- Ownership is enforced in the API (every /me query filters by the verified user id).
create policy app_access_orders on stimaimmobile.orders for all to stimaimmobile_app using (true) with check (true);

-- Stripe keys live in Vault, isolated from other apps of the shared project.
-- Secrets: stimaimmobile_stripe_secret (sk_test_… / sk_live_…), stimaimmobile_stripe_webhook (whsec_…).
create function stimaimmobile.stripe_keys(out secret_key text, out webhook_secret text)
language sql security definer set search_path = pg_catalog
stable
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'stimaimmobile_stripe_secret'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'stimaimmobile_stripe_webhook');
$$;
revoke all on function stimaimmobile.stripe_keys() from public, anon, authenticated;
grant execute on function stimaimmobile.stripe_keys() to stimaimmobile_app;
