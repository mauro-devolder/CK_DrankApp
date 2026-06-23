# Samenvatting — Chiro Drankjes (stand 2026-06-23)

Handoff-document zodat je het contextvenster kunt wissen. Hieronder: wat de app is,
hoe ze in elkaar zit, de vastgelegde beslissingen, wat klaar is en wat nog open staat.

---

## 1. Wat het is

Een Dutch PWA (plain HTML/CSS/JS, géén build-stap, Supabase REST voor een gedeelde
cloud-teller) die het manuele "dopjes in een beker"-systeem vervangt. Iedereen
registreert met minimale frictie zijn drankjes op zijn eigen gsm; maandelijks rekent
een host af en berekent de **zwerf** (gedronken − geregistreerd) tegen de voorraad.

**Twee apps, dezelfde code en database:**
- **Leiding-app** — `https://mauro-devolder.github.io/CK_DrankApp/` (de ~30 leiding)
- **Aspi-app** — `https://mauro-devolder.github.io/CK_DrankApp/aspi/` (de 6 aspi's)

Lokaal testen via de preview-server op poort 8000 (`/` en `/aspi/`).

## 2. Bestanden

| Bestand | Rol |
|---|---|
| `index.html` | Leiding-app (instappunt) |
| `aspi/index.html` · `aspi/manifest.json` · `aspi/sw.js` | Aspi-app (zet `window.APP_GROUP='aspi'` + `ASSET_BASE='../'`) |
| `members.js` | Ledenlijst (30 leiding + 6 aspi) met `groep` + de 7 drankjes + bak/halve bak |
| `store.js` | Datalaag: offline-wachtrij (localStorage), sync, host-modus, groep-logica |
| `api.js` | Dunne wrapper rond de Supabase REST-API |
| `config.js` | Supabase-URL + sleutel, `HOST_PIN=8888`, `ASPI_PIN=7777` |
| `app.js` | Controller: alle schermen en interacties |
| `styles.css` | Stijl (mobile-first, groot, hoog contrast) |
| `sw.js` | Service worker leiding-app (network-first) |
| `supabase/schema.sql` | DB-schema (consumptions, stock_entries, app_config) |
| `img/` | Productfoto's (pint, frisdrank, chips, water, sterkbier, kriek, desperados, bak, halvebak) |
| `DrankIdee.md` | Oorspronkelijk ontwerpdoc |

## 3. Architectuur in het kort

- **Eén Supabase-tabel `consumptions`** (id = client-UUID = idempotent, person_id,
  registered_by, drink_code, tijdstip, status `actief`/`pending_delete`/`verwijderd`).
  Verwijderen = statuswijziging (propageert naar andere toestellen), geen harde delete.
- **Offline-first:** elke tik gaat onmiddellijk lokaal in localStorage (`synced:false`)
  en synct bij verbinding. `navigator.storage.persist()` tegen iOS-eviction.
- **Twee apps uit één codebase:** `window.APP_GROUP` ('leiding' standaard, 'aspi' in
  `/aspi/`). `getMembers()` en alle lijsten/logs/overzichten filteren op groep.
  localStorage-sleutels voor **identiteit/host/pincode** krijgen een `.aspi`-suffix
  (localStorage is gedeeld per origin); **drankdata + voorraad** blijven gedeeld.
- **Eén frigo → één voorraad → één zwerf**, bij de **drankleiding** (leiding-app).
  De zwerf rekent ALLE registraties mee (leiding + aspi). De **aspi-export** is apart
  (in de aspi-app, enkel aspi-regels, geen voorraad/zwerf).

## 4. Vastgelegde beslissingen & conventies

- **Vertrouwenssysteem (bewust):** de publishable Supabase-sleutel is publiek; wie de
  URL kent kan lezen/schrijven. Aanvaardbaar voor de Chiro-context. **Niet "fixen".**
- **Pincodes:** leiding `8888`, aspi `7777`. Lichte drempel, geen echte beveiliging.
  Enkel opper-host **Mauro** (`m04`, superadmin) kan ze wijzigen (epoch-intrekking →
  andere toestellen verliezen host). De aspi-code wijzigt Mauro vanuit de leiding-app.
- **Ledenlijst in code** (`members.js`), 1× per jaar bijwerken + pushen bij de wissel.
  Aspileiding = voorlopig enkel Mauro.
- **Dag/week-grens = maandag 08:00** (drankje om 01:00 's nachts telt bij de dag ervoor).
- **Log** toont per regel het uur (gededupliceerd), verwijderde drankjes doorstreept (🗑).
- **Commit & push:** Mauro gaf staande toestemming — altijd committen/pushen zonder te
  vragen (hij test via de GitHub Pages-deploy, ~1 min). Commit-messages eindigen met de
  Co-Authored-By Claude-regel.
- **Live data nooit wissen.** Mauro reset zelf vóór echt gebruik. DB-wachtwoord niet nodig.

## 5. Wat klaar is (volledig + getest)

Kernlus, voor-anderen/rondje, postvak met verwijderverzoek + host-goedkeuring, zelf-undo
60s, host-pincode met epoch-intrekking, maand-afrekening + voorraad + zwerf + export,
bak/halve bak, productfoto's, inklapbaar opgeschoond beheer, log met uren + doorstreepte
verwijderingen, geen dubbeltik-zoom, en de **volledige aspi-app** (eigen instappunt/icoon-
plek, code 7777, aspi-export, rollen, groep-scheiding zonder lekkage).

## 5b. Aspischulden (per maand, globale afrekening met goedkeuring)

De aspischuld blijft **per maand** staan en stapelt op (ze worden niet elke maand betaald). De
aspi-beheer toont de openstaande schuld **per maand, per persoon** (juni 2026 → Michelle 3p 1f…),
zodat elke maand-zwerf van de drankleiding de schuld van díe maand gebruikt — niet een blok sinds
de laatste afrekening. Afrekenen wist géén registraties; het legt één **gedeeld watermerk**
(`aspi_settlements.effective_at`, `person_id='ALL'`), zodat de maand-zwerf ongemoeid blijft. De
openstaande schuld = de actieve aspi-drankjes ná dat watermerk.

Afrekenen gebeurt **voor álle aspi's tegelijk** (niet per persoon): de **aspileiding** drukt op
één knop *"Alle aspi's afrekenen"* → **goedkeuringsverzoek** bij de drankleiding (Mauro) in de
leiding-app, mét per-aspi snapshot. Pas na **Goedkeuren** telt iedereen weer van 0. Het
afrekenen zet één gedeeld watermerk; alle schuld/log **vóór** dat watermerk valt weg, dus na een
afrekening is de aspileiding-app **leeg** (de registraties blijven bestaan voor de zwerf).

Aspileiding logt in via **"Inloggen als aspileiding"** (code 7777); dat is een `leidingOnly`-
identiteit (`as1`) die nergens in de aspi-lijsten/export opduikt. Het **aspileiding-hoofdscherm**
toont de **log van álle aspi's per uur** (sinds de laatste afrekening) — geen stats, geen
drankknoppen; afrekenen/aanpassen/log-per-maand zitten onder ⚙️. In de **aspi-app** is de sectie
**ANDERE** (bak/halve bak e.d.) volledig verborgen — niet voor de aspi's. Terminologie: overal
**"drankleiding"** (de term "opper-host" wordt nergens nog gebruikt). Gewone aspis zien **geen
stats-knop** (hun eigen log volstaat); de aspileiding ziet de stats wél, *"sinds de laatste
afrekening"* (`getAspiOutstanding`).

## 5c. Drankspel (enkel leiding)

In de **ANDERE**-sectie staat **Drankspel** vóór bak/halve bak (enkel leiding, want ANDERE is
verborgen in de aspi-app). Klikken → `screen-drankspel` met drie stappen: **(1)** aantal pinten
van het spel (stepper, default `DRANKSPEL.defaultPints` = 10), **(2)** wie meespeelt, **(3)**
verdelen: **Gelijk verdeeld** (standaard, totaal/N per speler) of **Per persoon** (toont enkel de
meespelers met − [aandeel] + in stappen van 0,5; start vanaf de gelijke verdeling). Bij bevestigen
krijgt elke deelnemer een pint-registratie met zijn aandeel via `store.addDrankspel({ shares })`
(`shares = [{personId, aantal}]`, aantal mag decimaal zijn). De deelnemers krijgen de gewone
in-app melding (`registered_by` = wie het ingaf) en zien de (decimale) pinten in hun log; ze
**tellen mee in de zwerf** (pinten uit de frigo).

Decimale pinten werken via een nieuwe kolom **`consumptions.aantal numeric default 1`**: gewone
registraties hebben `aantal = 1`, een drankspel een kommagetal. De tellingen/log/zwerf sommeren
`aantal` i.p.v. rijen te tellen; `fmtAmount()` toont het netjes met komma. **Robuust bij
uitrol:** gewone registraties sturen `aantal` enkel mee als het ≠ 1 is en de fetches gebruiken
`select=*`, dus de app blijft werken ook al is de `aantal`-kolom nog niet gedraaid — enkel
**bierpong** vereist die kolom.

## 6. Openstaande punten

1. **`supabase/schema.sql` opnieuw draaien** in Supabase bij elke schema-uitbreiding. Nodig voor:
   `app_config`-pincode + `aspi_pin`/`aspi_epoch`, de tabel `aspi_settlements`, en de kolom
   **`consumptions.aantal`** (voor bierpong). Het script is idempotent (`if not exists`) en wist
   geen data. Tot een onderdeel gedraaid is, werkt de rest gewoon door; enkel díe functie
   (afrekenen-sync resp. bierpong) propageert pas zodra de kolom/tabel bestaat.
2. **Apart aspi-icoon** — er staat nu een gegenereerd icoon in `/aspi/` (zelfde beeld + subtiel
   "CK-aspi" onderaan), verwezen vanuit `aspi/manifest.json`/`aspi/index.html`/`aspi/sw.js`.
   Mauro kan `aspi/icon-192.png` / `aspi/icon-512.png` / `aspi/apple-touch-icon.png` vervangen
   door een eigen ontwerp als hij iets mooiers wil.
3. **Export-hoofdletters** — de export schrijft `Mauro 3p`; het ontwerpdoc-voorbeeld was
   `mauro 3p`. Te wijzigen als de externe automatisering op kleine letters matcht.
4. **Echte keldertest** (vliegtuigmodus) vóór de eerste echte avond blijft aanbevolen.
5. **Bekende, aanvaarde grens:** wat een aspi vergeet te tikken, valt in de ene zwerf die
   de drankleiding draagt (zwerf is per definitie niet toewijsbaar). Bij te veel last is
   "aspi als één groepstotaal" later een kleine stap terug.

## 7. Hoe verder werken

- **Lokaal:** preview-server (poort 8000); op localhost is de service worker bewust uit
  (altijd verse code). Bij het testen van de aspi-app navigeer je naar `/aspi/`.
- **Deploy:** committen + pushen naar `main` → GitHub Pages bouwt ~1 min.
- **Jaarlijkse wissel:** namen in `members.js` aanpassen (let op het `groep`-veld) + pushen.
- **Reset vóór echt gebruik:** in de leiding-app, Beheer → "Alles resetten" (enkel Mauro).
