# Actualizarea Workerului existent după migrarea D1 0004–0005

Migrațiile `0004_location_contact.sql` și `0005_soft_delete.sql` sunt deja aplicate și verificate în [rularea `apply`](https://github.com/petruandines/cleaning-services/actions/runs/36265611980). Workerul existent rulează încă versiunea veche. Pagina publică `/cleaning-services/portal/` rămâne Appwrite. **Nu relansa workflow-ul de prima instalare sau migrarea D1.**

Workflow-ul manual `portal-worker-update.yml` va folosi un commit fix revizuit. `inspect` verifică, fără scriere, UUID-ul/numele/jurisdicția EU ale D1, schema finală 0005, hashurile tuturor celor cinci fișiere SQL, subdomeniul Workers și faptul că Workerul există deja. `deploy` repetă verificările, folosește cheia existentă `PORTAL_WORKER_AUTH_SECRET` în aceeași publicare cu codul și așteaptă ca API-ul public să expună metodele noii versiuni. Nu aplică migrații, nu importă clienți și nu schimbă pagina GitHub Pages.

1. În Cloudflare → My Profile → API Tokens → Create Token → Custom token, creează un token temporar `portal-worker-update-temp`, limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu `Account → D1 → Read` și `Account → Workers Scripts → Edit`, expirare scurtă. Nu reutiliza tokenul D1 Upgrade revocat. Nu trimite tokenul în chat.
2. În [GitHub Actions secrets](https://github.com/petruandines/cleaning-services/settings/secrets/actions), adaugă un **repository secret** `PORTAL_WORKER_UPDATE_TOKEN` cu valoarea brută a tokenului Cloudflare. Verifică separat că `PORTAL_WORKER_AUTH_SECRET` există; nu îl înlocui.
3. În [Portal Worker versioned update (manual)](https://github.com/petruandines/cleaning-services/actions/workflows/portal-worker-update.yml), pe branch `main`, alege `operation=inspect`, lasă `confirmation` gol și apasă Run workflow o singură dată. Trimite linkul rulării. Așteaptă verificarea înainte de deploy.
4. După inspect verde și verificat, folosește **o nouă rulare** cu branch `main`, `operation=deploy` și confirmarea exactă `UPDATE petru-ines-portal-api 6816004b-dc95-48c9-be52-9bd4131d157e`. În caz de eșec, nu apăsa Re-run: deploymentul ar putea fi deja efectuat; verifică întâi Workerul public.
5. După confirmarea publicării, revocă tokenul `portal-worker-update-temp` în Cloudflare și șterge **doar** `PORTAL_WORKER_UPDATE_TOKEN` din GitHub. Păstrează `PORTAL_WORKER_AUTH_SECRET` și copia sa privată.

Frontendul nou de previzualizare și testele cu un client fictiv vin separat; nu comuta `portal/` public prin acest workflow.
