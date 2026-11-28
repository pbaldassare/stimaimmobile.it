-- Referrers (segnalatori): own login, own discount codes, see who used them.
create table stimaimmobile.referrers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  active boolean not null default true,
  notes text not null default '' check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Discount codes in euro, each owned by one referrer. Expiry and max uses are optional.
create table stimaimmobile.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9-]{3,32}$'),
  referrer_id uuid not null references stimaimmobile.referrers(id),
  discount_cents integer not null check (discount_cents > 0),
  active boolean not null default true,
  valid_until date,
  max_uses integer check (max_uses is null or max_uses > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coupons_code on stimaimmobile.coupons(code);
create index coupons_referrer on stimaimmobile.coupons(referrer_id);

-- Orders keep list price and discount; amount_cents stays the amount actually due (0 with a full discount).
alter table stimaimmobile.orders
  add column coupon_id uuid references stimaimmobile.coupons(id),
  add column list_price_cents integer,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);
update stimaimmobile.orders set list_price_cents = amount_cents where list_price_cents is null;
alter table stimaimmobile.orders alter column list_price_cents set not null;
alter table stimaimmobile.orders drop constraint orders_amount_cents_check;
alter table stimaimmobile.orders add constraint orders_amount_cents_check check (amount_cents >= 0);
create index orders_coupon on stimaimmobile.orders(coupon_id) where coupon_id is not null;

alter table stimaimmobile.referrers enable row level security;
alter table stimaimmobile.coupons enable row level security;
grant select, insert, update on stimaimmobile.referrers, stimaimmobile.coupons to stimaimmobile_app;
-- Access rules (admin, own referrer) are enforced in the API, like the other tables of this schema.
create policy app_access_referrers on stimaimmobile.referrers for all to stimaimmobile_app using (true) with check (true);
create policy app_access_coupons on stimaimmobile.coupons for all to stimaimmobile_app using (true) with check (true);
