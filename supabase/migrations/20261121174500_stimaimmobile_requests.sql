alter table stimaimmobile.contacts
  add column kind text not null default 'contact'
    check (kind in ('contact', 'coverage', 'estimate')),
  add column status text not null default 'new'
    check (status in ('new', 'contacted', 'closed')),
  add column notes text not null default ''
    check (length(notes) <= 4000),
  add column updated_at timestamptz not null default now();

update stimaimmobile.contacts
  set kind = 'coverage'
  where length(trim(comune)) > 0 or length(trim(zona)) > 0 or length(trim(destinazione)) > 0;

create index contacts_status_created_at on stimaimmobile.contacts(status, created_at desc);

grant update on stimaimmobile.contacts to stimaimmobile_app;

-- Isolated Resend key for this app. Value lives in Vault as stimaimmobile_resend, not in git.
create function stimaimmobile.resend_api_key() returns text
language sql security definer set search_path = pg_catalog
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'stimaimmobile_resend';
$$;

revoke all on function stimaimmobile.resend_api_key() from public, anon, authenticated;
grant execute on function stimaimmobile.resend_api_key() to stimaimmobile_app;
