-- Chiro Drankjes — databaseschema voor Supabase.
-- Plak dit in: Supabase → SQL Editor → New query → Run.
-- Eén tabel volstaat voor de gedeelde teller; de ledenlijst en drankjes
-- zitten voorlopig in members.js (verhuizen later naar de DB).

create table if not exists public.consumptions (
  id            uuid primary key,                 -- door de telefoon gegenereerd (idempotent)
  person_id     text        not null,             -- voor wie (id uit members.js)
  registered_by text        not null,             -- door wie getikt
  drink_code    text        not null,             -- p f c w s k d
  tijdstip      timestamptz not null default now(),
  status        text        not null default 'actief'  -- actief | pending_delete | verwijderd
);

create index if not exists consumptions_tijdstip_idx on public.consumptions (tijdstip);
create index if not exists consumptions_person_idx   on public.consumptions (person_id);

-- Row Level Security aanzetten en de anon-rol toelaten te lezen/schrijven.
-- Let op: dit is een vertrouwenssysteem zonder echte login. De anon-sleutel
-- zit in de PWA en is dus publiek; wie de URL kent, kan in principe schrijven.
-- Voor een Chiro-vriendengroep aanvaardbaar (zie DrankIdee.md, sectie 8).
alter table public.consumptions enable row level security;

drop policy if exists "anon select" on public.consumptions;
drop policy if exists "anon insert" on public.consumptions;
drop policy if exists "anon update" on public.consumptions;
drop policy if exists "anon delete" on public.consumptions;

create policy "anon select" on public.consumptions for select to anon using (true);
create policy "anon insert" on public.consumptions for insert to anon with check (true);
create policy "anon update" on public.consumptions for update to anon using (true) with check (true);
create policy "anon delete" on public.consumptions for delete to anon using (true);

-- Voorraad per maand per drankje (voor de zwerf-berekening).
-- type = 'in' (begin) of 'rest' (fysiek geteld op het einde).
create table if not exists public.stock_entries (
  id         uuid primary key default gen_random_uuid(),
  drink_code text    not null,
  type       text    not null,                  -- 'in' | 'rest'
  aantal     integer not null default 0,
  maand      text    not null                   -- 'YYYY-MM'
);

-- Eén waarde per (drankje, type, maand) -> upsert werkt hierop.
create unique index if not exists stock_entries_uniq
  on public.stock_entries (drink_code, type, maand);

alter table public.stock_entries enable row level security;

drop policy if exists "anon all stock" on public.stock_entries;
create policy "anon all stock" on public.stock_entries for all to anon using (true) with check (true);

-- Gedeelde app-instellingen: de host-pincode + een 'epoch' die ophoogt telkens
-- de opper-host de pincode wijzigt. Andere toestellen verliezen dan host-modus.
create table if not exists public.app_config (
  id        int  primary key default 1,
  host_pin  text not null default '8888',
  host_epoch int not null default 1,
  constraint app_config_single check (id = 1)
);

-- Aparte pincode + epoch voor de aspi-app (zelfde mechanisme als de leiding-code).
-- 'add column if not exists' zodat een bestaande database mee bijgewerkt wordt.
alter table public.app_config add column if not exists aspi_pin   text not null default '7777';
alter table public.app_config add column if not exists aspi_epoch int  not null default 1;

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "anon all config" on public.app_config;
create policy "anon all config" on public.app_config for all to anon using (true) with check (true);
