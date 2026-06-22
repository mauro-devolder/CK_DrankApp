# Supabase aankoppelen — eenmalige setup (±5 min)

Hierna staat de teller in de cloud en ziet telefoon A de drankjes van telefoon B.

## 1. Maak een gedeeld Chiro-account

Gebruik een **gedeeld e-mailadres van de Chiro** (niet je persoonlijke), zodat het
project blijft bestaan bij de jaarlijkse leidingswissel.

1. Ga naar https://supabase.com → **Start your project** → registreer met het Chiro-adres.
2. **New project**:
   - Name: `chiro-drankjes`
   - Database password: kies er één en bewaar het (heb je zelden nodig).
   - Region: `West EU (Ireland)` of dichtstbij.
3. Wacht tot het project klaar is (~1 min).

## 2. Maak de tabel aan

1. Linksboven: **SQL Editor** → **New query**.
2. Open het bestand [`supabase/schema.sql`](supabase/schema.sql), kopieer de volledige
   inhoud, plak ze in de editor.
3. Klik **Run**. Je zou "Success. No rows returned" moeten zien.

## 3. Haal je twee sleutels op

1. Ga naar **Project Settings** (tandwiel) → **API**.
2. Kopieer:
   - **Project URL** (bv. `https://abcdxyz.supabase.co`)
   - **anon / public** key (een lange tekst die begint met `eyJ...`)

## 4. Vul ze in

Plak die twee waarden in [`config.js`](config.js):

```js
export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...jouw-anon-key...';
```

Sla op en herlaad de app. Klaar — vanaf nu synct elke registratie automatisch,
en zie je de drankjes van alle toestellen samen in het overzicht.

## Goed om te weten

- **Veiligheid:** dit is bewust een vertrouwenssysteem. De anon-sleutel zit in de
  app en is dus publiek; wie de URL kent, kan in principe schrijven. Voor een Chiro
  aanvaardbaar (zie `DrankIdee.md`, sectie 8). Deel de app-URL gewoon niet breder dan nodig.
- **Offline:** tikt iemand zonder bereik (kelder), dan wordt het lokaal bewaard en
  gesynct zodra er weer verbinding is. Het statusje `⟳ N` bovenaan toont hoeveel er nog wacht.
- **Gratis:** ruim binnen de gratis tier op Chiro-schaal.
