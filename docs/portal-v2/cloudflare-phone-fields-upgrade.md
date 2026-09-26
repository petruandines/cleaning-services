# Etapa 0006: link pentru factură și notițe interne

**Stare:** D1 `petru-ines-portal-eu` (jurisdicție EU) are migrațiile 0001–0005 aplicate. Workerul public folosește încă schema 0005; interfața `/portal/` rămâne Appwrite. Noua migrare **nu a fost aplicată** cât timp pregătim codul.

Migrarea 0006 adaugă doar două coloane opționale: `clients.internal_note` (exclusiv pentru administratori) și `payments.invoice_url` (link HTTPS vizibil clientului). Rândurile existente rămân, iar coloanele noi sunt NULL pentru ele.

## După publicarea workflow-ului manual pe `main`

1. În Cloudflare → My Profile → API Tokens creează un **token nou** `portal-fields-d1-temp`, limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu `Account → D1 → Edit` (include citirea) și expirare scurtă. Nu trimite valoarea în chat.
2. În [GitHub Actions secrets](https://github.com/petruandines/cleaning-services/settings/secrets/actions) salvează valoarea brută exclusiv sub numele `PORTAL_D1_FIELDS_TOKEN`.
3. Deschide [Portal D1 invoice and notes fields (manual)](https://github.com/petruandines/cleaning-services/actions/workflows/portal-d1-fields-upgrade.yml), branch `main`, `operation=inspect`, **confirmation și backup_confirmation goale**. Pornește o singură dată și trimite linkul rulării pentru verificare.
4. Verifică jurnalul `Verified EU D1 through 0005, exact 0006 target and six pinned SQL files.` și copiază privat `Time Travel bookmark before fields upgrade` împreună cu data. `inspect` nu modifică D1.
5. Abia după analiza rulării, o **nouă rulare** `operation=apply` cere exact `APPLY PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e` și `TIME TRAVEL VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e`. Dacă rezultatul este roșu, nu apăsa `Re-run`: verifică înainte istoricul migrărilor. După succes, revocă tokenul D1 în Cloudflare și șterge doar `PORTAL_D1_FIELDS_TOKEN` în GitHub.
6. Publicarea noului Worker este un workflow **diferit**, după confirmarea schemei 0006. Necesită temporar `Account → D1 → Read` și `Account → Workers Scripts → Edit`, în secretul `PORTAL_WORKER_FIELDS_TOKEN`; `PORTAL_WORKER_AUTH_SECRET` se păstrează. Pe [Portal Worker fields update](https://github.com/petruandines/cleaning-services/actions/workflows/portal-worker-fields-update.yml), rulează întâi numai `inspect` cu confirmation gol; după verificare, `deploy` într-o rulare nouă cu `UPDATE PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e`. Revocă apoi tokenul Workers și șterge numai `PORTAL_WORKER_FIELDS_TOKEN`.

Frontendul nou se publică **doar pe calea de previzualizare**, după Worker. Nu introduce date ale clienților reali până la testele cu client fictiv și exportul independent cu restaurare verificată. Time Travel este temporar.
