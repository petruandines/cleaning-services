# Portal API — Worker publicat pentru testare; portalul public nu este comutat

Interfața rămâne la `https://petruandines.github.io/cleaning-services/portal/`.
Acest Worker primește cereri de pe acel origin după conectarea interfeței noi. Codul nu conține credentiale; 
`BETTER_AUTH_SECRET` se setează ca Worker secret, niciodată în repository.

## Stare

- Baza Cloudflare D1 EU `petru-ines-portal-eu` (UUID `6816004b-dc95-48c9-be52-9bd4131d157e`) are migrațiile 0001–0003 aplicate. Administratorul a fost creat și a activat TOTP. Tokenurile temporare de migrare și administrare au fost revocate; secretul permanent `PORTAL_WORKER_AUTH_SECRET` este păstrat.
- Workerul de test este publicat la `https://petru-ines-portal-api.petruandines.workers.dev`. Previzualizarea GitHub Pages este la `/cleaning-services/portal-v2-frontend/`; portalul public `/cleaning-services/portal/` folosește încă versiunea Appwrite.
- Sesiunea previzualizării persistă maximum opt ore în aceeași filă și este revalidată după refresh. Proprietarul a confirmat în browser că rămâne conectat.
- În ramura draft, cardurile programărilor afișează clientul și locația, mesajele sunt prezentate ca dialog, iar locațiile acceptă contact opțional. Aceste versiuni ale API și interfeței **nu sunt încă publicate**. Migrația nouă `../docs/portal-v2/0004_location_contact.sql` există numai în draft și **nu este aplicată în D1 remote**. Aplic-o și verific-o separat înainte să publici codul nou, care citește coloanele adăugate.
- Exportul criptat și restaurarea au fost demonstrate pe D1 local; testul de recuperare remote și backupul săptămânal sunt încă de făcut. Nu importa date reale și nu comuta portalul public până la verificările necesare.

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

## Migrații și publicare

Migrațiile inițiale `0001`–`0003` au fost aplicate și verificate în [rularea inițială](https://github.com/petruandines/cleaning-services/actions/runs/36095944402). **Nu relansa** workflow-ul de migrare inițială: verifică explicit că baza existentă are acele migrații, apoi folosește un flux separat, verificat, cu token temporar D1 Edit și confirmare precisă pentru `0004_location_contact.sql`. Fă o copie de siguranță înainte de upgrade. Nu transmite tokenul prin chat și revocă-l după aplicare. Publică versiunea nouă a Workerului doar după validarea coloanelor, apoi interfața de previzualizare; păstrează portalul public pe Appwrite până la testarea funcțiilor și restaurării.

Workerul curent a fost publicat la `https://petru-ines-portal-api.petruandines.workers.dev` în 25 septembrie 2026. Pentru verificare read-only există `portal-worker-verify.yml` pe `main`.

## Următoarele etape

1. Implementează editarea și ștergerea înregistrărilor, cu permisiuni, audit și protecția relațiilor dintre clienți, programări, lucrări și plăți.
2. Pregătește și testează un workflow separat de upgrade D1 0004; verifică backupul și baza reală înainte de aplicare.
3. Publică Workerul și previzualizarea actualizate, testează pe telefon contul echipei și un cont fictiv de client, apoi verifică o restaurare remote într-o bază distinctă.
4. Abia după verificări planifică trecerea controlată a `/cleaning-services/portal/`.
