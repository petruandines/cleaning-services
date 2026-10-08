# Rapoarte de intervenție — Petru & Inés

Data: 8 octombrie 2026. Activarea și publicarea au fost aprobate de utilizator după verificări.

## Surse inspectate

- Frontend: `main` la `948415eee1c6f8cf231f3163c3e1e211d3201a9f`.
- Backend folosit de workflow-ul actual: `5e6e1401cf3ef9380d633be5885f28e719a43596`.
- Branch-uri noi: `feat/one-time-pdf-reports` (frontend) și
  `feat/one-time-pdf-backend` (backend).
- Configurația inițială avea numai D1, secretul de autentificare și PUBLIC_API_URL.
- Backend revizuit pentru activare: `8e34db0e6b8d2609fc2cf3ef2949794ce7d12e89`.
- R2 a fost activat de utilizator. Bucketul `petru-ines-project-reports` este Standard,
  în jurisdicția `eu`, verificat fără r2.dev public și fără Custom Domains.
- Cloudflare a confirmat planul Workers Free prin răspunsul 100328 la configurarea
  plafonului CPU exclusiv pe Workerul de test. Niciun plan Workers nu a fost schimbat.

## Implementare

Adminul poate bifa separat generarea automată, implicit dezactivată. Finalizarea
confirmată se păstrează independent de generare; raportul folosește un snapshot
cu date destinate clientului și rezultatul funcției de tarifare existente.
Snapshot-ul primei generări este capturat la finalizare; regenerările ulterioare
folosesc datele disponibile și cresc versiunea fără a redeschide intervenția.

Browserul construiește PDF-ul A4. API-ul pregătește un șablon determinist și
verifică exact conținutul încărcat, înainte de R2, față de rețeta serverului.
Această alegere evită publicarea unui PDF arbitrar asociat unui JSON valid.
Nu sunt folosite Browser Rendering, un browser pe server, CDN-uri sau servicii
externe de conversie. Serializarea simplă de verificare necesită totuși CPU Worker;
consumul de verificare a fost testat pe Workers Free în Cloudflare, fără upgrade.
Acest test nu reprezintă o promisiune de 0 CPU sau garanția tuturor timpilor viitori.

Logo: originalul `assets/img/logo.png`, codificat fără pierderi. Culori din CSS-ul
actual; font DejaVu Sans cu licența inclusă, text selectabil și hartă ToUnicode.
Caracterele absente din font produc o eroare, fără publicarea unui document greșit.
CUI și registrul comerțului vin din configurația oficială existentă a furnizorului.

Două tabele strict aditive: `one_time_project_reports` și
`one_time_project_report_files`; un index dedicat. Niciun PDF binar în D1.
JSON-ul snapshot-ului/rețetei este temporar, necesar recuperării generării, și se
elimină după salvare sau ștergere. Rămân metadatele și un registru intern al cheilor
de storage. Metadatele versiunilor șterse nu reprezintă copii ale documentelor.
Nu există cron, retenție automată, cache PDF sau backup PDF în această extensie.

## Acces și recuperare

- API admin nou: `/api/one-time/admin/:id/report` (GET metadate; POST preferință,
  pregătire, upload PDF verificat, ștergere confirmată).
- Download admin: `/api/one-time/admin/:id/report-download`.
- Download client: `/api/one-time/client/:token/report`, cu cookie-ul existent.
- Origin, bearer admin, rol admin și TOTP sunt verificate prin fluxul existent.
  Clientul trece aceleași verificări de acces, generație, cookie și expirare;
  accesul este reverificat după citirea R2.
- Download `attachment`, `no-store`, HTTPS, fără URL R2 public și fără listare.
- Un ticket și o cheie UUID generate pe server asigură reluarea aceleiași generări.
  O confirmare UI pierdută după salvare nu produce încă un upload.
- O scriere R2 reușită urmată de eroare D1 poate fi recuperată prin HEAD și
  metadatele digestului. Un upload întrerupt poate fi reluat cu aceeași cheie.
- Ștergerea blochează mai întâi downloadul; eșecul R2 păstrează starea de ștergere
  în așteptare. Nici jurnalul, nici intervenția nu sunt șterse.
- Înlocuirea unui raport cere confirmare și șterge întâi versiunea existentă.
  Dacă noua generare eșuează, raportul vechi nu mai există; se poate reîncerca.
- Registrul de chei permite curățarea unor operațiuni R2 întrerupte între R2 și D1.
  Descărcările sunt interzise pentru cheile care nu sunt versiunea `ready` curentă.

## Verificări locale

Testele backend și frontend execută date fictive și acoperă autorizarea, izolarea,
TOTP, CSRF, expirarea/revocarea, tarif fix/orar, snapshot-ul finalizării, upload
modificat, reluarea fără duplicate, eroarea R2, eroarea confirmării D1, ștergerea,
regenerarea și checklist cu 500 de sarcini. Fluxul complet admin/client este
executat în DOM cu serializerul real din browser, SQLite și un storage R2 simulat.

Un raport fictiv de patru pagini a fost randat și inspectat cu Poppler; extracția
textului și diacriticelor se verifică separat. Build-ul static și compilarea
Worker dry-run sunt verificate fără publicare.

## Verificări în Cloudflare

Au trecut 103 teste backend și 12 frontend, inclusiv configurația finală.
Workflow-ul izolat folosește un Worker cu un secret temporar, o bază D1 separată
și un bucket R2 privat de test. Auth-ul fictiv există exclusiv în acel Worker,
protejat cu secretul temporar; autentificarea producției nu este substituită.
Au trecut opt-out, opt-in, save/retry, download client, ștergere, regenerare,
păstrarea finalizării, revocare și IDOR. Au fost generate rapoarte orare cu 45
și 500 de sarcini (4 și 52 de pagini) pe planul Workers Free.
Workerul temporar și D1 de test au fost eliminate. Bucketul de test este separat,
privat și documentele fictive au fost șterse prin API-ul de rapoarte.

Referință: https://github.com/petruandines/cleaning-services/actions/runs/37777555445
Cloudflare Tail nu a furnizat valori CPU numerice în acest cont. Succesul sub
plafonul fix Free este verificat; nu afirmăm un maxim CPU măsurat sau headroom
cuantificat. Planul D1 și consumul agregat/facturarea contului nu sunt accesibile
prin permisiunile actuale ale tokenului. Nu s-au activat planuri plătite suplimentare.
Un Android fizic nu a fost disponibil pentru testare; acest smoke manual rămâne
neexecutat și trebuie consemnat separat, fără a fi prezentat drept test trecut.

## Configurație și procedură de activare

1. În Cloudflare, verifică planul Workers/D1, dacă R2 este activ și condițiile de
   facturare. R2 Standard include un nivel gratuit, dar depășirile pot fi taxate.
   Dacă pagina cere activarea unui abonament/card, oprește-te și solicită acord.
2. Reutilizează un bucket privat potrivit sau creează `petru-ines-project-reports`
   în clasa **Standard**, preferabil în jurisdicția EU dacă este disponibilă în
   cont. `r2.dev` public și Custom Domains trebuie dezactivate. Fără CORS public,
   lifecycle de ștergere, replicare sau copii PDF suplimentare.
3. Păstrează DB, domeniul API, secretul de autentificare, rutele și politica
   Workers.dev actuale. Adaugă numai binding-ul R2 `PROJECT_REPORTS` și variabila
   `PROJECT_REPORTS_ENABLED="true"` la activarea aprobată. Fără binding/variabilă,
   extensia rămâne dezactivată și intervențiile existente funcționează.
4. Permisiuni necesare pentru operatorul de configurare: Account / Workers R2
   Storage / Edit pentru bucket/binding; Workers Scripts / Edit pentru publicarea
   codului; D1 / Edit pentru schema aditivă. Folosește un token limitat la contul
   actual; nu pune tokenuri în fișiere, PR, browser sau repository.
5. Aplică numai `one-time-migrations/0006_reports.sql` pe D1 identificat și
   verificat. Scriptul actualizat `one-time-schema.mjs` acceptă noua schemă fără
   modificarea tabelelor sau rândurilor existente.
6. Verifică staging cu DB și bucket de test separate, exclusiv date fictive.
   Testează și întreruperea conexiunii, revocarea, expirarea și Android fizic;
   măsoară CPU în Cloudflare la PDF-uri scurte și la 500 de sarcini.
7. După acordul pentru producție, actualizează pin-ul backend din workflow la
   commitul revizuit. Guardurile de deployment și inspectorul Cloudflare sunt extinse pe branch
   strict pentru cele două binding-uri noi: R2 `PROJECT_REPORTS` și
   variabila `PROJECT_REPORTS_ENABLED`. Configurația Wrangler trebuie să păstreze explicit bucketul aprobat; guardul
   refuză publicarea dacă un binding R2 live ar fi eliminat accidental. Aceste modificări
   de configurație/deployment nu sunt aplicate acum.
8. Integrează frontend și backend coordonat; frontend-ul tolerează un backend
   anterior fără endpointul report. Publică numai după toate verificările și
   confirmarea utilizatorului. Verifică apoi rutele și funcțiile existente.

## Consum orientativ

| Acțiune | Cereri HTTP Worker suplimentare | R2 | D1 |
|---|---:|---|---|
| Activarea bifei | 1 | Niciuna | Metadate + eveniment |
| Generare obișnuită | 2 (prepare + upload), apoi actualizarea UI existentă | 1 PUT | Citiri snapshot/sesiune; câteva scrieri metadata/jurnal |
| Download client/admin | 1 | 1 GET | Sesiune/acces + metadate |
| Ștergere | 1, apoi actualizarea UI | 1 DELETE în cazul obișnuit | Metadate, registru și eveniment |
| Recuperare confirmare pierdută | 1 | Eventual 1 HEAD | Verificare/publicare metadata |

Citirile D1 depind de numărul de sarcini și de indexuri, nu sunt egalate cu numărul
cererilor HTTP. Auth și verificarea existentă de expirare consumă și ele operații.
Înlocuirea/curățarea unor operațiuni întrerupte adaugă ștergeri R2. Vizualizarea nu
regenerează raportul; este reutilizat polling-ul existent al clientului.

Limite publice verificate la 8 octombrie 2026: Workers Free 100.000 cereri/zi și
10 ms CPU/cerere; D1 Free 5 milioane rânduri citite/zi, 100.000 scrise/zi, 5 GB
total (cu limite suplimentare per bază); R2 Standard 10 GB-lună, 1 milion operații
Class A și 10 milioane Class B/lună incluse. DELETE și egress R2 sunt gratuite.
Nivelurile gratuite nu confirmă planul sau consumul real al acestui cont.

Surse oficiale:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/

## Token de deployment

Workflow-ul de producție folosește secretul GitHub Actions `PORTAL_REPORTS_CF_TOKEN`
pentru backendul cu R2. Tokenul existent de migrare nu are acces la noul bucket.
Tokenul nu este necesar pentru operațiunile admin/client din portal după deploy:
acestea folosesc bindingurile Worker. Dacă tokenul temporar expiră, trebuie reînnoit
pentru publicări ulterioare; portalul și downloadurile existente continuă să funcționeze.
Nu afișa tokenul în loguri și nu îl salva în repository. Tokenurile vechi nu au fost înlocuite.

## Rollback

Rollback rapid, fără migrare inversă: setează `PROJECT_REPORTS_ENABLED="false"` în Wrangler și republică același backend
verificat prin workflow-ul actual. Păstrează bindingul R2 și guardurile actualizate.
Funcțiile noi rămân dezactivate, iar fluxul intervențiilor continuă. Dacă este
necesară retragerea interfeței, revino numai la fișierele frontend precedente,
fără a reveni la workflow-ul vechi care nu cunoaște bindingul R2. Păstrează tabelele noi și
bucketul privat; nu șterge istoricul, autentificarea sau sesiunile. Guardurile de
rollback trebuie să accepte binding-urile noi existente sau să le elimine numai
din configurația Worker după aprobarea operatorului, fără ștergerea obiectelor.
Nu rula migrații inverse sau DROP TABLE. Documentele se pot administra ulterior
după reactivarea codului verificat.
