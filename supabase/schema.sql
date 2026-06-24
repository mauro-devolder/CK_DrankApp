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

-- Gewicht van een registratie. Normaal 1 (één drankje per rij). Bierpong verdeelt
-- 10 pinten over de spelers, dus dan kan dit een kommagetal zijn (bv. 2.5).
alter table public.consumptions add column if not exists aantal numeric not null default 1;

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

-- Aspi-afrekeningen: de aspischuld telt cumulatief door over de maanden en wordt
-- pas op 0 gezet via een afrekening die de opper-host goedkeurt. Een goedgekeurde
-- afrekening zet GEEN registraties op 'verwijderd' (anders zou de maand-zwerf van
-- de drankleiding mee verschuiven); ze legt enkel een watermerk (effective_at).
-- De openstaande schuld van een aspi = zijn actieve drankjes na dat watermerk.
create table if not exists public.aspi_settlements (
  id           uuid        primary key,            -- door de telefoon gegenereerd
  person_id    text        not null,               -- welke aspi
  status       text        not null default 'pending', -- pending | approved | rejected
  requested_at timestamptz not null default now(),
  effective_at timestamptz,                         -- bij goedkeuring = requested_at
  resolved_at  timestamptz
);

create index if not exists aspi_settlements_person_idx on public.aspi_settlements (person_id);

-- Snapshot (per-aspi schuld als tekst) op het moment van goedkeuring, voor het
-- archief "Vorige aspi-afrekeningen". 'add column if not exists' = veilig opnieuw te draaien.
alter table public.aspi_settlements add column if not exists snapshot text;

alter table public.aspi_settlements enable row level security;

drop policy if exists "anon all settlements" on public.aspi_settlements;
create policy "anon all settlements" on public.aspi_settlements for all to anon using (true) with check (true);

-- Afgesloten afrekenperiodes (leiding-app). De drankleiding sluit op het einde
-- van een periode af: dat archiveert de exporttekst + de datums van–tot. De start
-- van de huidige (nog open) periode = max(end_at), of het begin als er nog geen is.
create table if not exists public.periods (
  id          uuid        primary key,              -- door de telefoon gegenereerd
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  export_text text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists periods_end_idx on public.periods (end_at);

alter table public.periods enable row level security;

drop policy if exists "anon all periods" on public.periods;
create policy "anon all periods" on public.periods for all to anon using (true) with check (true);
