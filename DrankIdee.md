# Rapport: digitaal drankjessysteem Chiro

Werkdocument om mee aan de slag te gaan met Claude Code. Bevat de context, de gekozen aanpak, de architectuur, de datastructuur, de risico's, en een gefaseerd bouwplan. De kernbeslissingen onderaan sectie 3 zijn vastgelegd in overleg en sturen de bouw.

---

## 1. Context & probleem

In de Chiro betaalt leiding voor drankjes uit de frigo. Vandaag houdt iedereen dat bij door het **dopje of lipje** van zijn drankje in een **beker met zijn naam** te doen. Op het einde worden de dopjes geteld en weet je wie wat moet betalen.

Twee problemen met het huidige systeem:

1. **Oneerlijkheid (compliance).** Mensen nemen hun dopje mee naar huis of laten het vallen ("zwerf"). Die drankjes zijn wél gedronken maar worden niet betaald.
2. **Bewerkelijk (boekhouding).** Dopjes met de hand tellen is werk.

Belangrijk om bij de bouw te onthouden: een digitaal systeem lost vooral probleem 2 op (optellen). Probleem 1 (eerlijkheid) blijft bestaan — het systeem maakt registreren makkelijker, maar dwingt niemand. Het blijft een vertrouwenssysteem: misbruik wordt ontmoedigd door transparantie en herleidbaarheid (zie sectie 3), niet hard tegengehouden.

## 2. Doel

Een drankje registreren met **minimale frictie** (richtwaarde: max twee handelingen), met een **lopende teller per persoon** die centraal wordt bewaard, plus een maandelijkse afrekening en een berekening van de "zwerf".

Concreet doelbeeld van de gebruiker:
- Tikt (optioneel) de NFC-tag/QR aan de frigo, of opent de app vanaf het startscherm.
- Ziet ter bevestiging zijn eigen naam, groot bovenaan.
- Tikt één knop voor het drankje (pint / frisdrank / ...).
- Krijgt onmiddellijke bevestiging ("✓ +1 pint"). Klaar. Teller +1.

**Belangrijk:** de app rekent zelf géén euro's. Ze houdt enkel **tellingen per persoon per drankje** bij en exporteert die in een vast tekstformaat dat in een bestaande externe automatisering gaat (die de prijzen kent). Gasten en prijzen worden volledig buiten de app geregeld.

## 3. Kernbeslissingen (lees dit eerst — vastgelegd)

**Geen gedeeld toestel.** Iedereen gebruikt zijn eigen gsm. Gevolg: de teller **moet centraal/in de cloud** staan, want telefoon A moet de registraties van telefoon B kunnen zien en optellen. Een puur lokale opslag op één toestel valt dus af.

**Per-telefoon identiteit.** Bij de eerste keer kiest de gebruiker eenmalig zijn naam uit de ledenlijst; die wordt lokaal op zijn toestel bewaard. Daarna weet de app op dat toestel altijd wie hij is.
- "Openen → je naam zien" werkt zonder login-gedoe bij elke beurt.
- Standaard registreer je voor **jezelf** (één tik op het hoofdscherm).

**Voor anderen registreren (rondje halen).** Je kan ook drankjes op de naam van anderen zetten (bv. je haalt 5 frisdrank, 1 voor jezelf en 4 voor anderen). Dit verlaat bewust de "alleen voor jezelf"-regel; de bescherming tegen misbruik wordt in de plaats:
- **Transparant:** wie een drankje op zijn naam krijgt, krijgt een melding (zie postvak hieronder).
- **Herleidbaar:** de app slaat op *wie* het toevoegde (`registered_by`), niet enkel *voor wie*. Misbruik is dus altijd te zien én aan iemand toe te wijzen.
- **Omkeerbaar:** klopt het niet, dan vraagt de betrokkene via één tik een host om het te verwijderen (zelfde host-goedkeuring als andere deletes).

**Melding via een postvak in de app (geen push, voorlopig).** Wie een drankje op zijn naam krijgt, ziet bij het openen van de app een belletje/teller met de melding ("Sven zette 1 frisdrank op jouw naam om 20:13 — klopt niet? Vraag verwijdering"). Dit is bewust géén echte push-melding: web-push op iPhone-PWA's is onbetrouwbaar en foutgevoelig (vereist installatie + toestemming, valt geregeld stil). Het postvak werkt op elke telefoon zonder toestemmingen en ook na offline-sync. Optionele echte push kan later toegevoegd worden (fase 3) als extra kanaal, nooit als enige.

**Backend: Supabase.** Eén gedeeld Chiro-account (niet een persoonlijk account, met het oog op de jaarlijkse leidingswissel). Gekozen boven Firestore omdat we zelf de offline-wachtrij controleren, het makkelijker te debuggen is, en omdat het exporteren naar het vaste tekstformaat eenvoudiger is. Gratis tier is ruim voldoende op Chiro-schaal.

**Client-UUID per registratie (idempotent).** Elke tik genereert op het toestel meteen een uniek id. Bij synchroniseren herkent de server aan dat id of een registratie al bestaat, zodat een tik die over slecht bereik twee keer vertrekt **nooit dubbel** wordt geteld. Voor de gebruiker onzichtbaar; het effect is een teller die altijd klopt.

**Offline-bestendigheid is een echte vereiste.** Frigo's staan vaak in een kelder met slecht bereik. De app zet registraties **lokaal in een wachtrij** (IndexedDB) en **synchroniseert zodra er weer verbinding is**. De tik lukt altijd meteen lokaal, met directe bevestiging, los van de sync.

**Periode = kalendermaand.** Registraties worden met datum/tijd opgeslagen en maandelijks opgeteld. Voorraad in/rest wordt per maand ingeboekt.

**Alle 7 types tellen mee**, inclusief zwerf-berekening: `p` pint, `f` frisdrank, `c` chips, `w` water, `s` sterk bier, `k` kriek, `d` Desperados.

**Verwijderen met host-goedkeuring.**
- **Zelf corrigeren** binnen ~60 seconden na de tik (mis getikt) — geen goedkeuring nodig.
- **Oudere registratie verwijderen** → komt in een wachtrij die een **host** (drankleiding, 4 personen) moet goedkeuren. Werkt ook als de goedkeuring pas later online gebeurt.

**Hosts & beheer.** De 4 drankleiding worden als host gemarkeerd in de ledenlijst. Het beheer-/goedkeuringsscherm zit achter een **gedeelde host-pincode** (volledige authenticatie is overkill).

**Ledenlijst in de database, niet in code.** ~30 leden. De lijst wordt 1× per jaar door een host zelf bijgewerkt (jaarlijkse wissel), zonder dat er code aangepast moet worden.

**NFC/QR is optioneel en komt laatst.** Eén statische tag of QR op de frigo die de app-URL opent volstaat als snelkoppeling/ritueel. Persoonlijke tags per leiding zijn niet nodig.

## 4. Functionele vereisten

**Registreren (hoofdscherm):**
- Toont de naam van de huidige gebruiker, groot bovenaan.
- Grote knoppen per drankje (de 7 types). Eén tik = één registratie voor jezelf (persoon, drankje, tijdstip).
- **Directe bevestiging** per tik ("✓ +1 pint"), ook offline.
- "Ongedaan maken" voor de laatste tik (binnen ~60s, zonder goedkeuring).
- **"Voor anderen" / rondje:** kies een drankje → tik één of meerdere namen aan → bevestig. Elke naam krijgt een registratie met `registered_by` = jij.
- **Postvak (belletje/teller):** toont meldingen van drankjes die anderen op jouw naam zetten, met per melding een één-tik "Vraag verwijdering" (maakt een host-verzoek aan).
- Zichtbare status of er nog registraties wachten om te syncen (zodat niemand uit twijfel opnieuw tikt).
- Werkt offline; queue + sync.

**Eerste gebruik:**
- Kies je naam uit de ledenlijst (scrollbaar/zoekbaar bij ~30 namen) → lokaal bewaard.
- Mogelijkheid om dit later te wijzigen (verkeerd gekozen, deelt toestel).

**Beheer (apart scherm achter host-pincode):**
- Ledenlijst beheren (jaarlijkse wissel: toevoegen / op inactief zetten / host-vlag).
- Voorraad inboeken per maand per drankje: `in` (begin) en `rest` (fysiek geteld op het einde).
- Verwijderverzoeken goedkeuren of weigeren.
- Overzicht per persoon per maand (tellingen per drankje).
- Zwerf-berekening per drankje.
- **Export in vast tekstformaat** (zie sectie 5).

## 5. Reconciliatie, zwerf & exportformaat

Per maand, **per drankje** (anders verbergen types elkaars fouten):

```
totaal verbruikt (fysiek) = voorraad_in − voorraad_rest
totaal geregistreerd      = som van alle registraties
zwerf (niet-geregistreerd)= totaal verbruikt − totaal geregistreerd
```

- `totaal verbruikt` = wat er echt uit de frigo ging.
- `zwerf` = wat gedronken werd zonder registratie (het echte oneerlijkheidsgetal).
- Let op: zwerf kan negatief uitvallen bij een telfout in de voorraad; de app toont dat als signaal i.p.v. het te verbergen.

**Exportformaat (de deliverable voor de externe automatisering):** één regel per persoon, daarna een `zwerf`-regel. Nul-tellingen worden weggelaten. Vaste lettervolgorde `p f c w s k d`.

```
sven 3p 1f 2s
marie 1f 1w 1k
...
zwerf 2p 1f
```

Dit formaat voedt de bestaande automatisering die de prijzen kent en de afrekening maakt. De app rekent zelf geen bedragen.

## 6. Datamodel

- `people`: id, naam, actief (bool), is_host (bool)
- `drinks`: code (`p`/`f`/`c`/`w`/`s`/`k`/`d`), naam
- `consumptions`: id (**client-gegenereerde UUID**), person_id (voor wie), registered_by (door wie — gelijk aan person_id bij zelf-registratie), drink_code, tijdstip, status (`actief` / `pending_delete` / `verwijderd`), + client-side gesynchroniseerd-vlag
- `notifications` (of afgeleid uit `consumptions` waar person_id ≠ registered_by): voor wie, welke registratie, gelezen-vlag
- `delete_requests` (of een statusveld op `consumptions`): welke registratie, aangevraagd door, goedgekeurd/geweigerd door welke host, tijdstip
- `stock_entries`: id, drink_code, type (`in` of `rest`), aantal, maand (`YYYY-MM`)

Afgeleid (queries, niet opslaan): tellingen per persoon per maand; per drankje verbruikt vs. geregistreerd; zwerf per drankje per maand.

## 7. Tech-stack

- **Frontend:** een PWA (installeerbaar op startscherm, geen app store nodig). Plain HTML/JS of een licht framework — houd het simpel.
- **Backend/DB:** Supabase (Postgres + gratis tier + kant-en-klare API). Eén gedeeld Chiro-account.
- **Offline queue:** IndexedDB op de client; flush naar Supabase bij herverbinding. Vraag persistente opslag aan (`navigator.storage.persist()`) en synchroniseer agressief (bij elke app-open), als tegenmaatregel voor opslag-eviction (zie risico's).
- **NFC/QR (later):** schrijf de app-URL naar een NFC-sticker of geprinte QR op de frigo.

Vermijd: een eigen server die je zelf draait. Managed gratis diensten, zodat er niets stuk gaat bij de leidingswissel.

## 8. Risico's & ontwerp-aandachtspunten

- **iOS PWA-opslag wordt gewist.** Safari/iOS kan localStorage + IndexedDB van een PWA verwijderen die ~7 dagen niet geopend is. Gevolg: de offline-wachtrij én de lokaal bewaarde naam kunnen verdwijnen. Tegenmaatregelen: `navigator.storage.persist()`, agressief syncen bij elke app-open, en duidelijke status tonen zodat een gebruiker ziet of er nog iets vastzit.
- **Dubbeltellingen bij slecht bereik.** Opgelost via client-UUID (idempotent) + directe lokale bevestiging, zodat niemand uit twijfel opnieuw tikt.
- **Eerlijkheid blijft de bovengrens.** Mensen kunnen niet-tikken of zichzelf onderrapporteren. De app lost dit niet volledig op.
- **Identiteit zonder echte login.** Naam wisselen kan iedereen; het is frictie, geen beveiliging. Voor een vriendengroep aanvaardbaar, maar bewust zo gekozen.
- **Registreren voor anderen kan misbruikt worden.** Bewust toegelaten voor het rondje-scenario. Bescherming = melding aan de betrokkene + `registered_by` (herleidbaar) + host-goedkeuring voor verwijdering. Geen sluitende beveiliging, wel een sterke ontmoediging.
- **Overdracht/onderhoud.** Leiding wisselt jaarlijks. Gedeeld Chiro-account, ledenlijst zelf bewerkbaar, managed diensten. Documenteer kort wie eigenaar van het account is.
- **Dataverlies.** Maandelijkse export is meteen een back-up; bewaar die.
- **Randgevallen:** mis getikt (zelf-undo binnen 60s), oudere correctie (host-goedkeuring), iemand deelt een toestel (naam wisselen), nieuwe leiding halverwege (ledenlijst bewerkbaar), negatieve zwerf (telfout, tonen).

## 9. Gefaseerd bouwplan (MVP eerst)

**Fase 1 — kernlus (MVP).** Supabase opzetten, ledenlijst in DB (eerst eenmalig geseed), eenmalig naam kiezen + lokaal bewaren, drankknoppen voor de 7 types met directe bevestiging, wegschrijven naar Supabase met client-UUID, zelf-undo binnen 60s, en een simpel overzicht "tellingen per persoon deze maand". Doel: de lus openen→naam→knop→teller werkt end-to-end.

**Fase 2 — boekhouding & rondjes.** Voorraad in/rest per maand inboeken, reconciliatie + zwerf per drankje, overzicht per persoon per maand, de **export in het vaste tekstformaat**, "Voor anderen"/rondje registreren + het **postvak in de app** met één-tik verwijderverzoek.

**Fase 3 — robuustheid & comfort.** Offline queue + sync hardmaken (testen met vliegtuigmodus/geen bereik), host-pincode + beheerscherm (leden bewerken, verwijderverzoeken goedkeuren), NFC-tag of QR op de frigo, optionele echte push-meldingen bovenop het postvak.

Bouw fase 1 volledig werkend voor je aan fase 2 begint. De grootste valkuil is alles tegelijk willen.
