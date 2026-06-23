// Supabase-instellingen. Vul deze twee waarden in met die van jouw project:
//   Supabase → Project Settings → API
//   - Project URL      -> SUPABASE_URL
//   - anon / public key -> SUPABASE_ANON_KEY
//
// Zolang hier de placeholders staan, draait de app gewoon lokaal (zonder
// gedeelde teller). Zodra je echte waarden invult, synct hij automatisch.

export const SUPABASE_URL = 'https://rsyzezxjnxawceoiwwfb.supabase.co';
// Nieuwe "publishable" client-sleutel (vervangt de oude anon key, werkt hetzelfde).
export const SUPABASE_ANON_KEY = 'sb_publishable_pqwZcYCrcba8DVyZbHaObg_O-er1QTx';

export function isConfigured() {
  return !SUPABASE_URL.includes('YOUR-PROJECT') &&
         !SUPABASE_ANON_KEY.includes('YOUR-ANON');
}

// Gedeelde pincode voor het beheerscherm (voorraad, export, verwijderverzoeken).
// Geen echte beveiliging — gewoon een drempel. Wijzig dit naar wens.
export const HOST_PIN = '8888';

// Aparte host-pincode voor de aspi-app (inloggen als aspi-/drankleiding daar).
export const ASPI_PIN = '7777';

