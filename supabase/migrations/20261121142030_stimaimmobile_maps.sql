create table stimaimmobile.maps_usage (
  singleton boolean primary key default true check (singleton),
  usage_day date not null,
  requests integer not null check (requests between 1 and 200)
);
alter table stimaimmobile.maps_usage enable row level security;
revoke all on stimaimmobile.maps_usage from public, anon, authenticated, stimaimmobile_app;

-- One shared daily allowance for this application. Only this named secret can be read.
create function stimaimmobile.reserve_maps_request() returns text
language plpgsql security definer set search_path = pg_catalog
as $$
declare today date := (now() at time zone 'UTC')::date;
begin
  insert into stimaimmobile.maps_usage as used (singleton, usage_day, requests)
  values (true, today, 1)
  on conflict (singleton) do update
  set usage_day = excluded.usage_day,
      requests = case when used.usage_day = today then used.requests + 1 else 1 end
  where used.usage_day <> today or used.requests < 200;
  if not found then return null; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'stimaimmobile_google_maps');
end;
$$;
revoke all on function stimaimmobile.reserve_maps_request() from public, anon, authenticated;
grant execute on function stimaimmobile.reserve_maps_request() to stimaimmobile_app;
