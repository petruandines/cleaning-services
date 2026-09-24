# Verificarea Cloudflare fără calculator — Petru & Inés

Stare: fluxul **numai de citire** este disponibil în GitHub Actions pe ramura `main`; nu rulează automat și nu face migrații sau deploy. Baza de verificat: `petru-ines-portal-eu`, UUID `6816004b-dc95-48c9-be52-9bd4131d157e`, jurisdicție `eu`. Pagina publică `portal/` rămâne pe Appwrite.

## Pașii de pe telefon

1. În Cloudflare → Account home, folosește căutarea `Copy account ID` sau mergi la Workers & Pages → Account Details → `Account ID`. ID-ul contului are 32 de caractere hexazecimale; nu este un token. Îl poți trimite în chat pentru a completa verificarea.
2. În Cloudflare → My Profile → API Tokens → Create Token → Custom token, acordă **doar** permisiunea `Account / D1 / Read`, limitată la contul care conține baza. Setează o expirare scurtă (de exemplu, o zi). Copiază tokenul privat când este afișat; nu îl trimite în chat, în capturi sau în fișierele publice.
3. În GitHub, la repository-ul `petruandines/cleaning-services` → Settings → Secrets and variables → Actions → New repository secret, setează numele exact `PORTAL_D1_READ_TOKEN` și ca valoare tokenul creat la pasul 2. Confirmă doar că secretul apare în listă; valoarea lui nu este afișată.
4. În GitHub → Actions → **Portal D1 identity (read only)** → Run workflow, selectează `main` și introduce `Account ID` la câmpul cerut. Workflow-ul verifică doar UUID-ul, numele și jurisdicția prin cerere GET la API-ul Cloudflare. Reușita apare în jurnal ca `Remote D1 UUID, name and EU jurisdiction confirmed. No data was changed.`
5. După verificare, revocă tokenul temporar în Cloudflare și șterge secretul `PORTAL_D1_READ_TOKEN` din GitHub. Pentru migrații/deploy se pregătește un acces separat și limitat; nu reutiliza tokenul de citire.

**Important:** această verificare nu poate rula până când workflow-ul manual este prezent pe ramura `main`, secretul a fost configurat și este introdus `Account ID`. Nu există niciun token în cod sau în documentație. Orice eroare oprește fluxul înainte de vreo scriere remote. Costurile GitHub Actions cu runner standard sunt gratuite pentru acest repository public, conform documentației GitHub la momentul configurării.
