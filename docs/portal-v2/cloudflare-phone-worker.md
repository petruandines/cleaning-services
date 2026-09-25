# Prima publicare a Workerului de pe telefon

Stare: baza D1 `petru-ines-portal-eu` din UE are cele trei migrații inițiale aplicate. Portalul public GitHub Pages continuă să folosească Appwrite. Workflow-ul de aici publică **numai Workerul nou** `petru-ines-portal-api`; nu schimbă `portal/` și nu creează clienți sau conturi.

## Pregătire

1. În managerul de parole, generează o parolă aleatoare **de cel puțin 48 de caractere**, numai litere, cifre, `_` și `-`. Păstreaz-o separat într-un loc privat: este cheia `BETTER_AUTH_SECRET` a Workerului, necesară și după primul deploy. Nu o trimite în chat, capturi sau fișiere din repository.
2. Din telefon, în GitHub → repository `petruandines/cleaning-services` → Settings → Secrets and variables → Actions → New repository secret, salvează această valoare sub numele **`PORTAL_WORKER_AUTH_SECRET`**. Workflow-ul o trimite la Cloudflare în aceeași operație cu publicarea codului; nu o afișează. Secretul rămâne în GitHub pentru publicări viitoare; nu îl revoca odată cu tokenul temporar Cloudflare.
3. În Cloudflare, creează un **token API temporar nou**, limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu `Account → D1 → Read` și `Account → Workers Scripts → Edit` (permisiunea `Edit` permite și citirea/listarea scripturilor). Dacă interfața cere o permisiune suplimentară pentru **crearea** unui Worker nou, oprește-te și verifică exact cerința; nu acorda permisiuni pentru alte conturi. Adaugă tokenul exclusiv în GitHub Actions ca secret **`PORTAL_WORKER_DEPLOY_TOKEN`**. Nu refolosi vechiul token D1 Edit și nu-l copia în chat.

## Inspect, apoi deploy

1. Deschide `.github/workflows/portal-worker-deploy.yml` din Actions → **Portal Worker first deployment (manual)** → **Run workflow**. Alege branch `main`, operația **`inspect`**, lasă `confirmation` gol și pornește. **Nu folosi „Re-run all jobs”.**
2. Verifică jurnalul. Rezultatul corect: `Verified EU D1 identity, 16 expected tables, locked SQL, account, Workers subdomain, and unused Worker name.` Dacă eșuează, nu lansa deploy; inspectează cauza.
3. Dacă `inspect` a trecut, pornește o execuție nouă: branch `main`, operația **`deploy`**, confirmarea exactă **`DEPLOY petru-ines-portal-api`**. Aceasta publică Workerul și secretul într-o singură operație. Jurnalul trebuie să confirme `Login serves HTTP 200; anonymous API correctly returns HTTP 401`. Nu relansa după eșec fără diagnostic: publicarea ar putea fi deja parțial încheiată.
4. După succes, **revocă tokenul API temporar în Cloudflare și șterge secretul `PORTAL_WORKER_DEPLOY_TOKEN` din GitHub**. Păstrează `PORTAL_WORKER_AUTH_SECRET` și copia ta privată; nu îl roti fără un plan de recuperare.

`inspect` nu publică Workerul. `deploy` verifică înainte de scriere UUID-ul, numele și jurisdicția EU ale D1, cele 16 tabele așteptate, hashurile migrațiilor, subdomeniul `petruandines.workers.dev` și că nu există deja un Worker cu același nume. Dacă detectează un Worker existent, se oprește înainte să îl suprascrie. După publicare verifică adresa `https://petru-ines-portal-api.petruandines.workers.dev` fără autentificare. Nu conține vreo operație de migrare, import de clienți sau schimbare a paginii publice.
