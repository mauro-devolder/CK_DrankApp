# DrankApp

Drankjesverbruik bijhouden in de Chiro. Iedereen op zijn eigen telefoon, gedeelde
teller in de cloud, werkt offline. Plain HTML/CSS/JS, geen build-stap, geen dependencies.

**Live:** https://mauro-devolder.github.io/CK_DrankApp/
**Installeren op je telefoon:** open de link → deel-icoon → *Zet op beginscherm*.

## Updaten / opnieuw uitrollen

Wijzig een bestand, dan:

```bash
git add -A && git commit -m "..." && git push
```

GitHub Pages bouwt automatisch opnieuw (±1 min) en de live-site is bijgewerkt.

## Lokaal draaien

Een service worker / PWA werkt niet via `file://`, dus serveer de map even:

```bash
cd PROJECT
python3 -m http.server 8000
```

Open daarna **http://localhost:8000** (op je telefoon: zelfde wifi, http://JOUW-IP:8000).
> Op `localhost` is de service worker bewust uitgeschakeld (altijd verse bestanden bij
> ontwikkelen). Op een echte host werkt hij gewoon, inclusief offline.

## Wat de app kan

- **Eerste keer:** kies je naam uit de (zoekbare) lijst; het toestel onthoudt het.
- **Hoofdscherm:** je naam groot bovenaan + 7 grote drankknoppen. Eén tik = +1, directe bevestiging (ook offline).
- **Ongedaan maken:** balk onderaan, 60 s geldig (zelf-correctie, geen host nodig).
- **Voor anderen (rondje):** kies een drankje → tik meerdere namen aan → bevestig.
- **Postvak (🔔):** zie wie iets op jouw naam zette; één tik om verwijdering te vragen.
- **Overzicht (📊):** tellingen per persoon, huidige maand, compact formaat (`3p 1f`).
- **Beheer (⚙️, pincode):** verwijderverzoeken goedkeuren, voorraad in/rest invoeren,
  zwerf per drankje, en **export** in jouw tekstformaat (`Mauro 2p 1k` … `zwerf 38p`).
- **Naam wisselen:** tik op je naam linksboven.

## Gedeelde teller (Supabase)

De app is bekabeld voor een gedeelde cloud-teller met offline-wachtrij. Zie
**[SUPABASE_SETUP.md](SUPABASE_SETUP.md)**. Zolang `config.js` placeholders bevat,
draait alles lokaal.

## Voor je het uitrolt — checklist

1. **Voorraadtabel:** her-run [`supabase/schema.sql`](supabase/schema.sql) in de Supabase
   SQL-editor (het bestand is idempotent). Het bevat nu ook de `stock_entries`-tabel die
   nodig is voor voorraad/zwerf. Zonder die tabel werkt voorraad enkel lokaal.
2. **Pincode:** wijzig `HOST_PIN` in [`config.js`](config.js) (standaard `1234`).
3. **Namen:** staan al ingevuld in [`members.js`](members.js); werk ze 1× per jaar bij.

## Bestanden

| Bestand | Rol |
|---|---|
| `index.html` | Alle schermen |
| `styles.css` | Opmaak — groot, simpel, mobile-first |
| `app.js` | Logica + schermwissels |
| `store.js` | Data-laag: lokale wachtrij + automatische sync |
| `api.js` | Supabase REST-aanroepen (geen bibliotheek) |
| `config.js` | Supabase URL + sleutel + host-pincode |
| `members.js` | Ledenlijst + drankjes |
| `supabase/schema.sql` | Databaseschema (consumptions + stock_entries) |
| `manifest.json`, `sw.js`, `icon.svg` | PWA (installeerbaar, offline shell) |

## Bekende beperking

Verwijderingen propageren tussen toestellen via een statusveld (`verwijderd`).
Voorraad-invoer is host-werk en gaat ervan uit dat je dan online bent.
