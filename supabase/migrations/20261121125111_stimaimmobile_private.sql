create schema stimaimmobile;
create role stimaimmobile_app nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant stimaimmobile_app to postgres;
revoke all on schema stimaimmobile from public, anon, authenticated;
grant usage on schema stimaimmobile to stimaimmobile_app;

create table stimaimmobile.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table stimaimmobile.rates (
  comune text not null,
  zona text not null,
  destinazione text not null,
  euro_mq numeric(12,2) not null check (euro_mq > 0),
  fonte text not null check (length(trim(fonte)) > 0),
  data_riferimento date not null,
  published_at timestamptz not null default now(),
  published_by uuid not null,
  primary key (comune, zona, destinazione)
);
create unique index rates_normalized on stimaimmobile.rates
  (lower(trim(comune)), lower(trim(zona)), lower(trim(destinazione)));

create table stimaimmobile.estimates (
  token_digest text primary key check (token_digest ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);
create table stimaimmobile.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  message text not null check (length(message) between 0 and 3000),
  comune text not null default '',
  zona text not null default '',
  destinazione text not null default ''
);
create index contacts_created_at on stimaimmobile.contacts(created_at desc);

alter table stimaimmobile.admins enable row level security;
alter table stimaimmobile.rates enable row level security;
alter table stimaimmobile.estimates enable row level security;
alter table stimaimmobile.contacts enable row level security;
revoke all on all tables in schema stimaimmobile from public, anon, authenticated;
grant select on stimaimmobile.admins to stimaimmobile_app;
grant select,insert,delete on stimaimmobile.rates to stimaimmobile_app;
grant select,insert on stimaimmobile.estimates, stimaimmobile.contacts to stimaimmobile_app;
create policy app_read_admins on stimaimmobile.admins for select to stimaimmobile_app using (true);
create policy app_access_rates on stimaimmobile.rates for all to stimaimmobile_app using (true) with check (true);
create policy app_access_estimates on stimaimmobile.estimates for all to stimaimmobile_app using (true) with check (true);
create policy app_access_contacts on stimaimmobile.contacts for all to stimaimmobile_app using (true) with check (true);
