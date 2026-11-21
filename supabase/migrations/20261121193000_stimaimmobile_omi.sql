create table stimaimmobile.omi_zones (
  semester text not null check (semester ~ '^\d{4}-[12]$'),
  area_territoriale text not null default '',
  regione text not null default '',
  provincia text not null default '',
  comune_istat text not null default '',
  comune_cat text not null default '',
  sez text not null default '',
  comune_amm text not null default '',
  comune text not null check (length(trim(comune)) > 0),
  fascia text not null default '',
  zona text not null check (length(trim(zona)) > 0),
  zona_descr text not null default '',
  link_zona text not null,
  cod_tip_prev text not null default '',
  descr_tip_prev text not null default '',
  stato_prev text not null default '',
  microzona text not null default '',
  source_file text not null default '',
  primary key (semester, link_zona)
);
create index omi_zones_comune on stimaimmobile.omi_zones (semester, lower(trim(comune)));

create table stimaimmobile.omi_quotes (
  semester text not null check (semester ~ '^\d{4}-[12]$'),
  comune text not null check (length(trim(comune)) > 0),
  provincia text not null default '',
  regione text not null default '',
  fascia text not null default '',
  zona text not null check (length(trim(zona)) > 0),
  link_zona text not null,
  tipologia_cod text not null default '',
  tipologia text not null check (length(trim(tipologia)) > 0),
  stato text not null default '',
  stato_prevalente boolean not null default false,
  compr_min numeric(12,2),
  compr_max numeric(12,2),
  sup_nl_compr text not null default '',
  loc_min numeric(12,2),
  loc_max numeric(12,2),
  sup_nl_loc text not null default '',
  source_file text not null default '',
  primary key (semester, link_zona, tipologia_cod, stato)
);
create index omi_quotes_comune on stimaimmobile.omi_quotes (semester, lower(trim(comune)));
create index omi_quotes_prevalent on stimaimmobile.omi_quotes (semester, stato_prevalente) where stato_prevalente;

alter table stimaimmobile.omi_zones enable row level security;
alter table stimaimmobile.omi_quotes enable row level security;
revoke all on stimaimmobile.omi_zones, stimaimmobile.omi_quotes from public, anon, authenticated;
grant select on stimaimmobile.omi_zones, stimaimmobile.omi_quotes to stimaimmobile_app;
create policy app_read_omi_zones on stimaimmobile.omi_zones for select to stimaimmobile_app using (true);
create policy app_read_omi_quotes on stimaimmobile.omi_quotes for select to stimaimmobile_app using (true);

create function stimaimmobile.omi_clear() returns void
language plpgsql security definer set search_path = pg_catalog, stimaimmobile
as $$
begin
  truncate stimaimmobile.omi_quotes, stimaimmobile.omi_zones;
end;
$$;

create function stimaimmobile.omi_ingest_zones(batch jsonb) returns integer
language sql security definer set search_path = pg_catalog, public, stimaimmobile
as $$
  with ins as (
    insert into stimaimmobile.omi_zones (
      semester, area_territoriale, regione, provincia, comune_istat, comune_cat, sez,
      comune_amm, comune, fascia, zona, zona_descr, link_zona, cod_tip_prev, descr_tip_prev,
      stato_prev, microzona, source_file
    )
    select
      nullif(item->>0, ''), coalesce(item->>1, ''), coalesce(item->>2, ''), coalesce(item->>3, ''),
      coalesce(item->>4, ''), coalesce(item->>5, ''), coalesce(item->>6, ''), coalesce(item->>7, ''),
      nullif(item->>8, ''), coalesce(item->>9, ''), nullif(item->>10, ''), coalesce(item->>11, ''),
      coalesce(nullif(item->>12, ''), (item->>0) || ':' || (item->>8) || ':' || (item->>10)),
      coalesce(item->>13, ''), coalesce(item->>14, ''), coalesce(item->>15, ''),
      coalesce(item->>16, ''), coalesce(item->>17, '')
    from jsonb_array_elements($1) as item
    where nullif(item->>0, '') is not null and nullif(item->>8, '') is not null and nullif(item->>10, '') is not null
    on conflict (semester, link_zona) do update set
      area_territoriale = excluded.area_territoriale,
      regione = excluded.regione,
      provincia = excluded.provincia,
      comune_istat = excluded.comune_istat,
      comune_cat = excluded.comune_cat,
      sez = excluded.sez,
      comune_amm = excluded.comune_amm,
      comune = excluded.comune,
      fascia = excluded.fascia,
      zona = excluded.zona,
      zona_descr = excluded.zona_descr,
      cod_tip_prev = excluded.cod_tip_prev,
      descr_tip_prev = excluded.descr_tip_prev,
      stato_prev = excluded.stato_prev,
      microzona = excluded.microzona,
      source_file = excluded.source_file
    returning 1
  )
  select count(*)::integer from ins;
$$;

create function stimaimmobile.omi_ingest_quotes(batch jsonb) returns integer
language sql security definer set search_path = pg_catalog, public, stimaimmobile
as $$
  with ins as (
    insert into stimaimmobile.omi_quotes (
      semester, comune, provincia, regione, fascia, zona, link_zona, tipologia_cod, tipologia,
      stato, stato_prevalente, compr_min, compr_max, sup_nl_compr, loc_min, loc_max, sup_nl_loc, source_file
    )
    select
      nullif(item->>0, ''), nullif(item->>1, ''), coalesce(item->>2, ''), coalesce(item->>3, ''),
      coalesce(item->>4, ''), nullif(item->>5, ''),
      coalesce(nullif(item->>6, ''), (item->>0) || ':' || (item->>1) || ':' || (item->>5)),
      coalesce(item->>7, ''), nullif(item->>8, ''), coalesce(item->>9, ''),
      (lower(coalesce(item->>10, '')) in ('true', 't', '1')),
      nullif(item->>11, '')::numeric, nullif(item->>12, '')::numeric, coalesce(item->>13, ''),
      nullif(item->>14, '')::numeric, nullif(item->>15, '')::numeric, coalesce(item->>16, ''),
      coalesce(item->>17, '')
    from jsonb_array_elements($1) as item
    where nullif(item->>0, '') is not null and nullif(item->>1, '') is not null
      and nullif(item->>5, '') is not null and nullif(item->>8, '') is not null
    on conflict (semester, link_zona, tipologia_cod, stato) do update set
      comune = excluded.comune,
      provincia = excluded.provincia,
      regione = excluded.regione,
      fascia = excluded.fascia,
      zona = excluded.zona,
      tipologia = excluded.tipologia,
      stato_prevalente = excluded.stato_prevalente,
      compr_min = excluded.compr_min,
      compr_max = excluded.compr_max,
      sup_nl_compr = excluded.sup_nl_compr,
      loc_min = excluded.loc_min,
      loc_max = excluded.loc_max,
      sup_nl_loc = excluded.sup_nl_loc,
      source_file = excluded.source_file
    returning 1
  )
  select count(*)::integer from ins;
$$;

create function stimaimmobile.publish_omi_rates(target_semester text default null) returns integer
language plpgsql security definer set search_path = pg_catalog, stimaimmobile
as $$
declare
  chosen text;
  publisher uuid;
  n integer;
begin
  select user_id into publisher from stimaimmobile.admins order by user_id limit 1;
  if publisher is null then
    raise exception 'Nessun amministratore in stimaimmobile.admins per pubblicare il listino OMI.';
  end if;
  chosen := nullif(trim(target_semester), '');
  if chosen is null then
    select max(semester) into chosen from stimaimmobile.omi_quotes;
  end if;
  if chosen is null then
    return 0;
  end if;
  delete from stimaimmobile.rates where fonte = 'Agenzia delle Entrate – OMI';
  insert into stimaimmobile.rates (comune, zona, destinazione, euro_mq, fonte, data_riferimento, published_by)
  select comune, zona, destinazione, euro_mq, 'Agenzia delle Entrate – OMI', data_riferimento, publisher
  from (
    select distinct on (
      lower(trim(q.comune)),
      lower(trim(left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150))),
      lower(trim(left(q.tipologia, 150)))
    )
      q.comune,
      left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150) as zona,
      left(q.tipologia, 150) as destinazione,
      round((
        case
          when coalesce(q.compr_min, 0) > 0 and coalesce(q.compr_max, 0) > 0 then (q.compr_min + q.compr_max) / 2
          when coalesce(q.compr_min, 0) > 0 then q.compr_min
          else q.compr_max
        end
      ), 2) as euro_mq,
      (split_part(q.semester, '-', 1) || case when split_part(q.semester, '-', 2) = '1' then '-06-30' else '-12-31' end)::date
        as data_riferimento
    from stimaimmobile.omi_quotes q
    left join stimaimmobile.omi_zones z on z.semester = q.semester and z.link_zona = q.link_zona
    where q.semester = chosen
      and (coalesce(q.compr_min, 0) > 0 or coalesce(q.compr_max, 0) > 0)
    order by
      lower(trim(q.comune)),
      lower(trim(left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150))),
      lower(trim(left(q.tipologia, 150))),
      case when q.stato_prevalente then 0 when lower(trim(q.stato)) = 'normale' then 1 else 2 end
  ) mapped
  where euro_mq > 0
    and not exists (
      select 1 from stimaimmobile.rates existing
      where lower(trim(existing.comune)) = lower(trim(mapped.comune))
        and lower(trim(existing.zona)) = lower(trim(mapped.zona))
        and lower(trim(existing.destinazione)) = lower(trim(mapped.destinazione))
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function stimaimmobile.omi_clear() from public, anon, authenticated, stimaimmobile_app;
revoke all on function stimaimmobile.omi_ingest_zones(jsonb) from public, anon, authenticated, stimaimmobile_app;
revoke all on function stimaimmobile.omi_ingest_quotes(jsonb) from public, anon, authenticated, stimaimmobile_app;
revoke all on function stimaimmobile.publish_omi_rates(text) from public, anon, authenticated, stimaimmobile_app;
