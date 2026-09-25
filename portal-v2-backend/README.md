# Portal API — draft, nu este publicat

Interfața rămâne la `https://petruandines.github.io/cleaning-services/portal/`.
Acest Worker va primi cereri de pe acel origin. Codul nu conține credentiale; 
`BETTER_AUTH_SECRET` se setează ca Worker secret, niciodată în repository.

## Stare

- Schema aplicației: `../docs/portal-v2/0001_app_schema.sql`. Schema Better Auth 1.7.5: `../docs/portal-v2/0002_auth.sql`, generată cu `BETTER_AUTH_SECRET=<valoare temporară> npm run generate:auth`. `../docs/portal-v2/0003_portal_accounts.sql` blochează accesul până la schimbarea parolei inițiale. Toate trei au fost aplicate în D1 local.
- API: citire filtrată după sesiune, mesaje de la client și echipă, creare de client, locație, programare, lucrare și plată de către echipă. Scrierile sunt validate, verifică legăturile cu același client și înregistrează auditul în aceeași tranzacție D1. Datele staff sunt blocate până la activarea TOTP.
- Autentificarea din `public/login.html` rulează pe originul Workerului, iar interfața de previzualizare din `../portal-v2-frontend/` primește tokenul prin `postMessage` cu verificarea originului, ferestrei și unui cod aleator. Tokenul rămâne **numai în memorie**: reîncărcarea paginii cere login nou.
- Interfața de previzualizare include formulare staff, căutarea clientului, paginare și deschiderea unei ferestre Worker pentru crearea conturilor. Parolele sunt introduse în ferestrele Worker, nu în formularele GitHub Pages. Clientul creat este legat de clientul selectat și vede datele numai după schimbarea parolei inițiale; sesiunile vechi sunt revocate.
- `disableSignUp` oprește înscrierea publică. `scripts/bootstrap-admin.mjs` pregătește offline administratorul inițial; nu introduce parola sau fișierul SQL în repository. **Nu am importat conturi pe Cloudflare și nu am verificat fluxul într-un browser real.** Exportul criptat și restaurarea au fost demonstrate numai pe D1 local; backupul remote nu este încă finalizat.
- `wrangler.jsonc` conține UUID-ul D1 și adresa Workerului furnizate de proprietar. Captura paginii Settings confirmă numele `petru-ines-portal-eu` și jurisdicția EU, dar nu afișează UUID-ul. Înainte de prima migrație remote, verifică automat **toate trei** valorile cu `node scripts/verify-remote-d1.mjs` după autentificarea Wrangler. Un `wrangler deploy --dry-run` validează numai construcția locală. Migrațiile D1 remote sunt aplicate și verificate; pentru prima publicare a Workerului folosește fluxul manual cu verificări descris mai jos.

## Verificare locală

`npm ci && npm test`. Suitele includ un flux autentic Better Auth pe SQLite în memorie: parolă, activare TOTP, creare cont client, schimbarea parolei inițiale, revocarea sesiunilor și logout; testul de bootstrap importă SQL-ul generat într-o altă bază de test. Pentru criptare: `python3 -m unittest discover -s test -p backup_test.py -v`. Verificarea în browser și pe D1 remote rămâne necesară.

## Backup criptat și restaurare

Instalează `python3 -m pip install -r scripts/requirements-backup.txt`. Păstrează cheia și copiile **în afara repository-ului**, în locuri separate. Comenzile de mai jos reprezintă un exemplu după configurarea bazei D1 UE; înlocuiește căile cu directoare private de pe un dispozitiv controlat:

```bash
python3 scripts/d1_vault.py keygen --out /cale-privată/cheie.key
python3 scripts/d1_vault.py export --database petru-ines-portal-eu --scope remote --key /cale-privată/cheie.key --out /copii-private/portal-YYYY-MM-DD.pi-d1
python3 scripts/d1_vault.py verify --input /copii-private/portal-YYYY-MM-DD.pi-d1 --key /cale-privată/cheie.key
python3 scripts/d1_vault.py restore-local-test --input /copii-private/portal-YYYY-MM-DD.pi-d1 --key /cale-privată/cheie.key
```

Scriptul folosește AES-256-GCM, o cheie aleatoare de 32 de octeți, nonce diferit pentru fiecare export, autentificare a fișierului și citire pe bucăți. Refuză să suprascrie fișiere și nu publică un SQL decriptat dacă cheia sau fișierul sunt greșite. Exportul Wrangler creează **temporar** un SQL în clar într-un director privat din sistem; execută-l numai pe un dispozitiv de încredere, cu stocare criptată, și păstrează separat o copie a cheii. Pierderea cheii face copiile inutilizabile. Time Travel Cloudflare este separat de acest backup. Un export poate bloca temporar solicitările bazei; programează-l în afara intervalelor aglomerate.

Pentru verificarea unei copii care conține un **client fictiv de control** cu ID cunoscut, adaugă `--expect-client-id IDUL_CLIENTULUI_FICTIV` la `restore-local-test`. Comanda va eșua dacă restaurarea nu conține exact acea înregistrare; proba automată `test_isolated_d1_export_preserves_related_records` verifică suplimentar că relația lucrare–plată și sumele fictive supraviețuiesc exportului D1, criptării și importului izolat. Nu folosi un ID de client real ca probă publică.

Proba executată aici: export **D1 local** → criptare → verificare → decriptare → import într-un D1 local izolat → verificarea integrității SQLite; testele acoperă și cheia greșită și fișierul modificat. Când contul Cloudflare devine accesibil, repetă proba cu export **remote** și import într-o bază remote de test distinctă; verifică înregistrări și relații înainte de a te baza pe copie. Configurează apoi rularea săptămânală, păstrarea versiunilor și alerta la eșec; aceste operații remote **nu au fost activate**.

## Configurare Cloudflare: date necesare și ordine

Proprietarul a creat baza D1 și a furnizat UUID-ul `6816004b-dc95-48c9-be52-9bd4131d157e` și subdomeniul `petruandines.workers.dev`. Sunt deja în `wrangler.jsonc`, iar adresa API este în configurația interfeței de previzualizare. Captura Cloudflare Settings arată baza `petru-ines-portal-eu`, jurisdicția **The European Union** și regiunea Eastern Europe. [Rularea GitHub Actions din 24 septembrie 2026](https://github.com/petruandines/cleaning-services/actions/runs/36050649911) a confirmat și legătura dintre UUID, nume, jurisdicție și contul Cloudflare, numai prin citire. Nu transmite parola Cloudflare, coduri 2FA, chei API sau cheia de backup în chat ori GitHub.

Pe telefon, urmează [fluxul manual `inspect` / `apply`](../docs/portal-v2/cloudflare-phone-migrations.md), cu token nou D1 limitat și confirmare explicită la aplicare. `scripts/migrate-phone.mjs` refuză o bază cu tabele deja prezente și verifică cele trei fișiere SQL înainte de migrare; dacă `apply` eșuează, inspectează cauza înainte de o nouă încercare. Pe un calculator controlat rămâne disponibilă alternativa `node scripts/verify-remote-d1.mjs` urmată de `npm run migrate:remote`, în terminal interactiv. Migrațiile aplică în ordine `0001_app_schema.sql`, `0002_auth.sql`, `0003_portal_accounts.sql` și sunt urmărite în `d1_migrations`. Migrațiile remote **au fost aplicate și verificate** în [rularea #3](https://github.com/petruandines/cleaning-services/actions/runs/36095944402). Tokenul temporar de migrare a fost revocat, iar secretul GitHub aferent a fost șters. **Nu relansa `apply`.** Adresa pregătită este `https://petru-ines-portal-api.petruandines.workers.dev`; nu presupune că răspunde până la primul deploy. Creează un `BETTER_AUTH_SECRET` aleator, păstrat în afara GitHub; la primul deploy poate fi încărcat cu `wrangler deploy --secrets-file /cale-privată/worker.env` (fișier privat cu `BETTER_AUTH_SECRET=...`). Nu încărca acel fișier în GitHub. Verifică apoi fluxul complet cu conturi fictive și TOTP. Pentru backupul inițial folosește comenzile de mai sus și o bază D1 remote **distinctă** pentru proba de restaurare. Până la aceste verificări nu comuta directorul `portal/` public și nu importa date reale.

## Prima publicare a Workerului de pe telefon

Urmează [ghidul pentru telefon](../docs/portal-v2/cloudflare-phone-worker.md) și workflow-ul manual `.github/workflows/portal-worker-deploy.yml`: mai întâi `inspect`, apoi `deploy` numai după verificarea rezultatului. Secretul `BETTER_AUTH_SECRET` se încarcă odată cu codul Workerului; autentificarea anonimă este verificată după publicare. Nu schimba încă `portal/` public și nu introduce clienți reali.

## Pregătirea administratorului, după configurarea D1 UE

Rulează doar după aplicarea migrațiilor `0001`, `0002`, `0003` în această ordine și după verificarea faptului că nu există deja un administrator. Pe un calculator controlat, setează `umask 077`, citește parola fără afișare (`read -rs PORTAL_ADMIN_PASSWORD`), apoi:

```bash
printf '%s\n' "$PORTAL_ADMIN_PASSWORD" | node scripts/bootstrap-admin.mjs --email ADRESA_ADMIN --name "Petru & Inés" --out /cale-privată/admin.sql
unset PORTAL_ADMIN_PASSWORD
```

Fișierul conține hashul parolei și are permisiuni `0600`; nu conține parola în clar. Verifică fișierul și, când baza remote este pregătită, importă-l o singură dată cu Wrangler `d1 execute --remote --file` în baza corectă, verifică autentificarea și activarea TOTP, apoi șterge fișierul SQL temporar. Nu rula comanda cu parola ca argument și nu publica fișierul.

## Pașii următori

1. Testează autentificarea cu două conturi fictive și unul staff într-un mediu cu Wrangler funcțional; verifică izolarea și logarea cu 2FA.
2. Testează în browser ferestrele de login și de creare cont, schimbarea parolei inițiale și formularele staff. Interfața nouă este momentan o previzualizare în `portal-v2-frontend/`; pagina publică `portal/` nu a fost modificată.
3. Configurează adresa Workerului după alocare, testează fluxul browser pe mobil/Safari și repetă exportul criptat plus restaurarea pe D1 remote de test înainte de date reale sau deploy public.
