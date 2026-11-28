-- Every completed questionnaire with contact details and privacy consent, bought or not.
create table stimaimmobile.valuation_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  comune text not null default '',
  zona text not null default '',
  destinazione text not null default '',
  address text not null default '',
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  privacy_accepted_at timestamptz not null,
  privacy_version text not null,
  recontact_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index valuation_requests_created_at on stimaimmobile.valuation_requests(created_at desc);
create index valuation_requests_comune on stimaimmobile.valuation_requests(lower(trim(comune)));

alter table stimaimmobile.orders add column request_id uuid references stimaimmobile.valuation_requests(id);
create index orders_request on stimaimmobile.orders(request_id) where request_id is not null;

alter table stimaimmobile.valuation_requests enable row level security;
grant select, insert on stimaimmobile.valuation_requests to stimaimmobile_app;
-- Read access is admin-only, enforced in the API like the other tables of this schema.
create policy app_access_valuation_requests on stimaimmobile.valuation_requests for all to stimaimmobile_app using (true) with check (true);
