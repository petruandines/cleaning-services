# Portal Petru & Inés — decizii și punct de reluare

Actualizat: 24 septembrie 2026. Document de lucru pentru migrarea portalului; nu schimbă pagina publicată și nu confirmă un sistem funcțional pe Cloudflare.

## Obiectiv confirmat

Portal pentru clienți și echipă, cu programări, locații, lucrări, sume în lei, stare a plății, mesaje text și istoric. Fără fotografii, PDF-uri, facturi în portal, fișiere încărcate, plăți online sau integrare WhatsApp. Facturarea contabilă rămâne în sistemul separat al firmei. Utilizarea vizată: cel puțin 100 de clienți, cost de operare inițial 0 lei, confidențialitate și posibilitate de recuperare a datelor.

Site-ul public rămâne la `https://petruandines.github.io/cleaning-services/`. Preferința proprietarilor este ca portalul să aibă exact calea `/cleaning-services/portal/`.

## Inventarul verificat în repository

- Există deja `portal/index.html`, `portal/portal.css`, `portal/src/app.mjs`, `portal/src/domain.mjs`, `portal/tests/portal.test.mjs`, bundle-ul `portal/app.js` și `portal/README.md`.
- Portalul actual folosește Appwrite Frankfurt; afișează clienți, programări, intervenții, facturi, locații, mesaje, note interne și permite crearea contului prin Function. `portal/README.md` spune explicit că mesajele nu se pot trimite încă, iar calendarul și modificarea programărilor nu sunt implementate.
- Testele existente simulează SDK-ul; nu dovedesc izolare între conturi sau funcționare în producție.
- Aspectul vizual, accesibilitatea de bază și formatarea banilor/orei pot fi refolosite. Codul de acces la Appwrite și fluxurile de facturi/PDF nu trebuie transplantate orbește.
- **Nu ștergem proiectul Appwrite și nu înlocuim interfața actuală până când noul backend, izolarea datelor și restaurarea din backup sunt verificate.**

## Constatare care schimbă ordinea implementării

GitHub avertizează că GitHub Pages nu ar trebui folosit pentru tranzacții sensibile, inclusiv trimiterea parolelor:
https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https

Pe `github.io` nu controlăm DNS/rutarea, astfel că un Worker nu poate servi direct aceeași cale ca aplicație proprie. Dacă frontendul GitHub Pages comunică cu un Worker de pe alt domeniu, apar decizii privind autentificarea cross-origin. Better Auth avertizează că Safari poate bloca cookie-urile cross-site; pluginul Bearer cere atenție specială la securitatea tokenurilor:
https://better-auth.com/docs/1.6/concepts/cookies
https://better-auth.com/docs/plugins/bearer

**Decizie confirmată de proprietar:** păstrăm exact URL-ul GitHub Pages `https://petruandines.github.io/cleaning-services/portal/`. API-ul și autentificarea rulează pe Worker, pe alt origin. Nu putem aduce Worker pe aceeași cale `github.io` fără controlul domeniului. Pentru noul login, tokenul de sesiune primit de la API rămâne numai în memoria tabului; nu intră în localStorage, sessionStorage, URL sau GitHub. Reîncărcarea paginii va cere autentificare din nou. Restricționăm CORS la originul exact, aplicăm CSP, limită de încercări și verificări server-side. Acest compromis trebuie testat pe mobil și în Safari înainte de lansare; avertismentul GitHub privind parolele pe Pages rămâne consemnat. Nu există pretenția de risc zero.

## Fundație propusă

- Worker API + D1, bază creată cu `--jurisdiction=eu`; această opțiune trebuie setată la creare. Restricția privește locul unde rulează/stă baza, nu garantează că toate cererile și toate prelucrările rămân în UE.
- Better Auth pentru utilizatori și sesiuni, fără înregistrare publică; numai administratorul creează conturi. Rolurile și asocierea utilizator–client se verifică în API, la fiecare solicitare. Niciun `client_id` trimis de browser nu acordă drepturi.
- Pe admin, 2FA TOTP și coduri de recuperare; pentru client, schimbarea parolei inițiale la prima conectare este cerință de proiectat și testat, nu o funcție deja implementată.
- Cheile, secretele și datele reale nu se comit în repository. În tabele păstrăm numai datele necesare serviciului. Prețurile se stochează în bani, `700,00 lei` se afișează în interfață.
- Nu există garanție de disponibilitate perpetuă sau de păstrare a planului gratuit. Pe Free, la depășirea cotelor D1 interogările pot eșua până la resetare. Se păstrează exportul portabil și un plan de recuperare.

## Modelul de date v1

Tabele de aplicație:

1. `clients`: nume afișat, tip PF/PJ, date de contact minime, stare.
2. `client_users`: legătura între ID-ul Better Auth și client; un utilizator poate avea acces la un client doar prin această asociere.
3. `locations`: client, denumire, adresă, instrucțiuni de acces limitate la ce este necesar.
4. `appointments`: client, locație, început/sfârșit ca UTC, stare, note vizibile clientului și note interne distincte; afișare în Europe/Bucharest.
5. `jobs`: client, programare opțională, serviciu, descriere, stare, preț în bani, dată finalizare.
6. `payments`: lucrare, sumă în bani, stare, dată confirmare; reprezintă evidența internă, nu o factură și nu procesarea efectivă a plății.
7. `messages`: client, expeditor autentificat, conținut text, marcaj citit; conversații între client și echipă.
8. `audit_events`: actor, acțiune, entitate, moment și un rezumat fără parole sau secrete.

Notificările din versiunea 1 se derivă din mesaje necitite și schimbările de status; tabel separat numai dacă apare un caz concret. Tabelele de autentificare se generează după fixarea versiunii Better Auth; nu le confundăm cu cele 8 tabele de aplicație.

Reguli: clientul vede numai datele propriului `client_id`, niciodată notele interne/auditul; staff vede și editează ce este permis de rol. Toate scrierile verifică existența și apartenența programării/locației/lucrării la același client. Istoricul schimbărilor sensibile se înregistrează server-side.

## Backup și limite verificate

D1 Free: 500 MB **pe bază**, 5 GB total pe cont, Time Travel **7 zile** (30 zile este numai pe planul plătit):
https://developers.cloudflare.com/d1/platform/limits/

Nu considerăm Time Travel drept backup extern. Prima livrare trebuie să includă export D1 criptat în afara Cloudflare și o probă de restaurare într-o bază de test. Programarea săptămânală, istoricul copiilor, cheia de decriptare păstrată separat și verificarea automată a reușitei sunt de implementat și demonstrat, nu de presupus.

## Etape verificabile

1. Forma URL este confirmată. Stabilim ce date din Appwrite, dacă există, trebuie migrate. Nu introducem date de clienți reali în test.
2. Creăm în ramura de lucru backendul, schema D1 și migrațiile; rulăm teste locale cu două identități client și una staff.
3. Implementăm API-ul și autentificarea; testăm accesul direct la ID-ul altui client, schimbarea parolei, revocarea sesiunii, rate limit și 2FA admin.
4. Refacem interfața existentă pentru noul API, scoatem ecranele de facturi/documente, adăugăm trimiterea mesajelor și gestionarea programărilor; verificăm pe mobil.
5. Configurăm D1 UE, secrete, Worker și backup; executăm export + restaurare într-o bază separată. Abia după acestea conectăm interfața la clienți reali.
6. Lansăm prin comutare controlată. Păstrăm Appwrite până când noul portal funcționează și datele migrate sunt verificate.

## Protocol de reluare cu consum redus de credite Work

La o sesiune nouă: citește mai întâi **acest fișier**, `portal/README.md` și ultimele commit-uri/PR-uri din proiect. Verifică starea curentă din cod; nu reface comparația de platforme, schema sau cercetarea de prețuri fără un motiv concret. Lucrează într-un singur pas verificabil pe sesiune, actualizează aici: **finalizat / testat / următorul pas / blocaje / commit sau PR**. Încheie înainte de limita de credite cu un commit al lucrului valid și cu blocajele scrise clar. Nu trece la implementarea loginului sau la date reale pe baza unei presupuneri.

### Stare la 24 septembrie 2026 — backup criptat și probă locală

- Finalizat în PR #1, ramura `codex/portal-v2-plan`: schema D1 (aplicație, Better Auth 1.7.5, flag parolă inițială), Worker API cu audit și izolare, login și creare cont în ferestre Worker, TOTP, schimbare parolă inițială, interfață de previzualizare cu formulare și paginare. `portal-v2-backend/scripts/bootstrap-admin.mjs` generează offline contul inițial cu hash, fără parolă în GitHub. `portal-v2-backend/scripts/d1_vault.py` exportă D1 în director privat temporar, criptează cu AES-256-GCM folosind cheie de 32 octeți ținută separat și verifică/restaurează în D1 local izolat.
- Testat efectiv: 13 teste JS/Better Auth + 2 teste criptare Python trec; cheie greșită sau fișier alterat sunt respinse fără fișier SQL restaurat. Proba completă locală a reușit: `wrangler d1 export --local` → criptare → verificare → decriptare → `wrangler d1 execute --local` într-o bază temporară separată → SQLite `PRAGMA integrity_check=ok` și `PRAGMA foreign_key_check` fără erori. Migrațiile 0001–0003 aplicate local. Test de browser/Safari și Cloudflare remote **nu s-au făcut**; `wrangler dev` eșuează aici (`uv_interface_addresses`), iar dashboard Cloudflare rămâne la verificarea browserului.
- Live: `https://petruandines.github.io/cleaning-services/portal/` folosește încă Appwrite. `portal-v2-frontend/config.js`, CSP-ul interfeței și `wrangler.jsonc` conțin `REPLACE_WITH_*`; nu există D1 UE, Worker, secret sau cont real importat prin acest PR. Nu comuta `portal/` și nu importa date reale înainte de testele remote și restaurare.
- Următorul pas când Cloudflare este accesibil: configurează D1 cu jurisdicție UE, Worker și secret; aplică migrațiile; importă o singură dată administratorul din SQL privat; activează TOTP; creează două conturi fictive; execută export criptat **remote**, import într-o bază D1 remote de test distinctă și verifică datele/relațiile; testează autentificarea/formularele pe mobil și Safari; abia apoi migrează datele reale și comută controlat calea exactă. Configurează rularea săptămânală, păstrarea versiunilor, cheia păstrată separat și alertă la eșec; automatizarea remote nu există încă.
- Limite cunoscute: exportul Wrangler produce un SQL în clar **temporar** pe dispozitiv, în director privat; rulează pe stocare locală criptată. Selectoarele de înregistrări încarcă cel mult 1000 de rânduri per client. Recuperarea remote și comportamentul în browser nu pot fi revendicate pe baza probei locale.
- Reluare economică: citește acest checkpoint și PR #1; nu repeta cercetarea platformei/schema. Verifică mai întâi starea contului Cloudflare, apoi urmează numai pașii remote și QA încă neexecutați. Salvează fiecare etapă în PR.

### Stare la 24 septembrie 2026 — verificare cu înregistrări fictive; cont Cloudflare creat

- Proprietarul a creat cont Cloudflare și se poate autentifica în contul său. Browserul asistat a rămas anterior într-o buclă de verificare Cloudflare; nu s-a confirmat acces la dashboard ori la D1 remote. Nu se retrimit parole, coduri 2FA, tokenuri Cloudflare sau cheia backupului prin chat.
- Finalizat în PR #1: `restore-local-test` poate verifica opțional un client fictiv cunoscut (`--expect-client-id`); testul D1 în director separat importă migrațiile, creează client, locație, programare, lucrare și plată fictive, exportă, criptează, restaurează în D1 local separat și verifică sumele, relațiile și cheile externe. 3 teste Python au trecut (inclusiv cazul unui ID absent); cele 13 teste JS erau deja verificate și codul JS nu s-a schimbat în această etapă. README conține instrucțiunile pentru crearea D1 EU și primul deploy cu secret privat.
- Blocaje neschimbate: **nu există** D1 EU remote configurat, UUID real, subdomeniu Worker verificat, secret, Worker publicat sau conturi reale. Exportul/restore remote, Safari/browser QA și backupul săptămânal nu au fost executate. Portalul live `/cleaning-services/portal/` rămâne pe Appwrite.
- Cel mai mic pas necesar din contul proprietarului: în Cloudflare Dashboard → D1 SQL Database → Create Database, numele `petru-ines-portal-eu`, `Specify jurisdiction` → `European Union`; după creare trimite numai UUID-ul `database_id` și subdomeniul public `workers.dev` al contului. Jurisdicția trebuie selectată la creare. Sau, pe un calculator controlat, `npx wrangler d1 create petru-ines-portal-eu --jurisdiction=eu`, cu autentificarea Cloudflare păstrată numai acolo. Nu executa migrații ori deploy până la configurarea Workerului și verificarea ID-ului.
- Reluare economică: pornește de la UUID-ul D1 și subdomeniul Workerului când devin disponibile, completează configurarea în PR, apoi aplică migrațiile, testează remote cu date fictive și restabilirea copiei, configurează backupul săptămânal și verifică în browser. Nu repeta probele locale sau căutarea platformei fără un defect concret.

### Stare la 24 septembrie 2026 — ID D1 primit și configurație actualizată

- Proprietarul a furnizat `database_id=6816004b-dc95-48c9-be52-9bd4131d157e`; acest UUID este acum în `portal-v2-backend/wrangler.jsonc`, în ramura draft. Nu este o parolă. Numele configurat rămâne `petru-ines-portal-eu`.
- Testat: `wrangler deploy --dry-run` cu UUID-ul nou compilează și identifică bindingul `DB`. Dry run nu interoghează baza remote și nu confirmă existența bazei, jurisdicția EU, autentificarea contului sau Workerul publicat. Nu au rulat migrații remote și nici un deploy real; portalul live rămâne Appwrite.
- Următoarea informație necesară: subdomeniul public al contului `*.workers.dev`, vizibil în Cloudflare → Workers & Pages → `Your subdomain`, plus confirmarea din pagina D1 că numele bazei este `petru-ines-portal-eu` și jurisdicția `European Union`. Nu cere parola, coduri 2FA ori token Cloudflare. Pe baza subdomeniului completează `PUBLIC_API_URL`, apoi pregătește fluxul securizat pentru migrații/deploy, secretul Workerului, teste remote fictive și restaurare distinctă înainte de comutarea portalului.
- Blocaj actual: browserul asistat a rămas în bucla de verificare Cloudflare; nu reîncerca ocolirea verificării. Reluarea să citească această stare, să nu refacă testele locale fără motiv și să păstreze PR #1 în draft.

### Stare la 24 septembrie 2026 — subdomeniu Worker primit

- Proprietarul a furnizat `petruandines.workers.dev`. URL-ul prevăzut pentru Workerul `petru-ines-portal-api` este `https://petru-ines-portal-api.petruandines.workers.dev` și a fost introdus în `portal-v2-backend/wrangler.jsonc`, `portal-v2-frontend/config.js` și CSP-ul interfeței de previzualizare. UUID-ul D1 rămâne `6816004b-dc95-48c9-be52-9bd4131d157e`.
- Testat: configurația backendului este JSON valid; URL-ul din backend, interfață și `connect-src` corespunde; `wrangler deploy --dry-run` trece cu ID-ul D1 și URL-ul Workerului. Nu s-a executat deploy, nu s-a verificat remote baza și nu s-a schimbat `portal/` public.
- Înainte de orice migrare remote: confirmă în dashboard că baza cu acel UUID se numește `petru-ines-portal-eu` și că jurisdicția este `European Union`. Browserul asistat întâmpină încă verificarea Cloudflare. Ulterior sunt necesare accesul Wrangler pe un dispozitiv de încredere, secretul privat, migrațiile, conturi fictive, backup/restore remote și testele browser/Safari. Nu solicita și nu salva parole/tokenuri Cloudflare în GitHub sau chat.
- Reluare economică: nu repeta validările locale fără motiv; pasul imediat este confirmarea numelui și jurisdicției D1, apoi alegerea modalității sigure de operare remote. PR #1 rămâne draft, portalul live rămâne Appwrite.

### Stare la 24 septembrie 2026 — jurisdicție confirmată vizual și gardă remote

- Captura trimisă de proprietar în 24 septembrie arată în Cloudflare → D1 Database → `petru-ines-portal-eu` → Settings: **Jurisdiction: The European Union**, **Region: Eastern Europe**, Read replication: Disabled. UUID-ul nu este vizibil în această captură; valoarea `6816004b-dc95-48c9-be52-9bd4131d157e` provine separat de la proprietar.
- Finalizat în PR #1: `portal-v2-backend/scripts/verify-remote-d1.mjs` citește, după autentificarea Wrangler pe un dispozitiv controlat, metadatele remote prin `wrangler d1 info --json` și refuză continuarea dacă UUID-ul, numele ori jurisdicția `eu` nu coincid cu `wrangler.jsonc`. Nu modifică date. Testul pentru nepotriviri UUID/nume/jurisdicție trece; suita JavaScript completă are **14 teste trecute**. README explică verificarea înainte de migrațiile remote.
- Neexecutat: verificarea D1 remote reală (nu există în această sesiune autentificare Wrangler), migrațiile remote, `BETTER_AUTH_SECRET`, deploy-ul Workerului, conturile fictive, restaurarea remote, testele browser/Safari și automatizarea backupului. `wrangler deploy --dry-run` anterior a trecut; portalul live de la `/cleaning-services/portal/` rămâne Appwrite.
- Următorul pas minimal: autentificare Wrangler în contul Cloudflare pe un dispozitiv controlat, apoi `node scripts/verify-remote-d1.mjs` din `portal-v2-backend/`. Dacă revine mesajul de succes, se pot aplica cele trei migrații remote în ordinea documentată. Nu trimite parola, coduri de autentificare sau tokenuri în chat/GitHub. Reia direct de aici fără refacerea testelor locale.

### Stare la 24 septembrie 2026 — migrații urmărite și reluabile

- Implementat în PR #1 `npm run migrate:remote`: cere terminal interactiv, verifică prin `wrangler d1 info --json` că baza din cont are **UUID-ul**, numele și jurisdicția EU din configurație, apoi pornește `wrangler d1 migrations apply petru-ines-portal-eu --remote` cu confirmarea afișată de Wrangler. Nu rulează migrații dacă verificarea eșuează. Nu a fost executat remote.
- Testat într-un D1 local nou și separat: aplicarea urmărită a celor trei migrații `0001`–`0003` reușește, iar a doua rulare afișează `No migrations to apply!`; toate cele 14 teste JavaScript trec. În acest mediu non-interactiv, comanda `migrate:remote` a refuzat să pornească înainte de vreo conexiune sau scriere.
- Captura Cloudflare arată numele și EU, dar încă lipsește verificarea UUID↔cont prin Wrangler. Pentru continuare este necesar ca proprietarul să folosească un calculator de încredere cu Node.js și acces Cloudflare, să autentifice Wrangler acolo și să ruleze `node scripts/verify-remote-d1.mjs` din proiect. Doar după un rezultat de succes rulează `npm run migrate:remote`; nu trimite credențiale în chat. Backendul real, backupul remote și browser QA rămân neexecutate; portalul live rămâne Appwrite.

### Stare la 24 septembrie 2026 — verificare D1 fără calculator

- Proprietarul nu are acces la PC. În loc de pașii locali Windows, am adăugat `.github/workflows/portal-d1-readonly.yml` atât pe ramura draft cât și pe `main`. Workflow-ul are **numai declanșare manuală**, nu face checkout/deploy/scriere, cere un `Account ID` cu 32 de caractere și folosește secretul `PORTAL_D1_READ_TOKEN` pentru un singur GET Cloudflare. Compară UUID-ul `6816004b-dc95-48c9-be52-9bd4131d157e`, numele `petru-ines-portal-eu` și jurisdicția `eu`; eroarea oprește jobul. Nu a rulat încă. Nu există token în repository.
- Instrucțiunile pentru telefon sunt în `docs/portal-v2/cloudflare-phone-setup.md`: proprietarul găsește Account ID, creează în Cloudflare un token temporar cu **Account / D1 / Read** pe contul propriu, îl introduce direct în GitHub → Settings → Secrets and variables → Actions sub numele `PORTAL_D1_READ_TOKEN`, apoi poate porni manual workflow-ul de pe `main`; după verificare revocă tokenul. **Nu cere tokenul, parola sau coduri 2FA în chat.** GitHub Actions pe runner standard este gratuit pentru acest repository public la data documentării.
- Necesită încă acțiune umană: tokenul limitat introdus în GitHub Secret și Account ID. Acest acces doar pentru citire nu va putea face migrații sau deploy; pentru acestea pregătește ulterior o etapă distinctă cu autorizație limitată și verificări. Portalul live rămâne Appwrite. La reluare pornește de la acest punct, nu repeta verificările locale.

### Stare la 24 septembrie 2026 — Account ID configurat pentru verificarea D1

- Proprietarul a furnizat Cloudflare Account ID `47b9f8498a9865c0fbbaca8f0f5cf59d` (32 caractere hexazecimale). Este în workflow-ul manual `.github/workflows/portal-d1-readonly.yml` pe `main` și în ramura draft; nu mai există câmp de introducere la pornire. Ghidul de telefon `docs/portal-v2/cloudflare-phone-setup.md` a fost actualizat.
- Verificat local: YAML valid, ID-ul are formatul așteptat, workflow-ul păstrează un singur GET Cloudflare și referința la secretul `PORTAL_D1_READ_TOKEN`. Nu a fost apelat API-ul Cloudflare, nu există confirmare că UUID-ul aparține contului și workflow-ul încă nu a rulat.
- Pasul minim de pe telefon: proprietarul creează token temporar Cloudflare cu `Account / D1 / Read` limitat la cont, îl introduce direct ca secret GitHub `PORTAL_D1_READ_TOKEN` și pornește manual workflow-ul de pe `main`. Nu cere niciodată valoarea tokenului în chat. La final revocă tokenul și șterge secretul. Migrațiile, deploy-ul, backupul și comutarea portalului rămân în așteptare; live este Appwrite.

### Stare la 24 septembrie 2026 — verificarea D1 remote a reușit

- Proprietarul a creat tokenul Cloudflare temporar și l-a introdus în secretul GitHub `PORTAL_D1_READ_TOKEN`, apoi a pornit manual workflow-ul de pe `main`.
- Confirmat din GitHub Actions: [rularea #1](https://github.com/petruandines/cleaning-services/actions/runs/36050649911), commit `4af320b1894966da10f7e6a09d3af8136725096a`, status **Success**, job `verify` **success**, pasul `Compare Cloudflare D1 metadata with the portal configuration` **success**. În acest workflow succesul înseamnă că API-ul Cloudflare a răspuns cu UUID-ul `6816004b-dc95-48c9-be52-9bd4131d157e`, numele `petru-ines-portal-eu` și jurisdicția `eu` pentru contul `47b9f8498a9865c0fbbaca8f0f5cf59d`. A fost doar GET; nu s-au modificat date.
- Următorul pas de igienă: revocă tokenul temporar în Cloudflare și șterge secretul `PORTAL_D1_READ_TOKEN` din GitHub, fără a-l expune în chat. Pregătește separat migrațiile D1 remote printr-un flux pentru telefon cu privilegii și verificări limitate. Migrațiile remote, Workerul, conturile fictive, backupul remote și schimbarea portalului live **nu sunt încă făcute**.

### Stare la 24 septembrie 2026 — migrații D1 pregătite pentru telefon, încă nerulate remote

- Workflow manual `.github/workflows/portal-d1-migrate.yml` este pe `main` și pe ramura draft; pe `main` face checkout la commitul fix `3405a131d5a606db90a8eea09d5ada7b09a40134` al backendului, fără token la `npm ci` sau la teste. Are două operații: `inspect` (doar citire) și `apply` (scrie numai dacă se introduce confirmarea exactă `APPLY 6816004b-dc95-48c9-be52-9bd4131d157e`). Un token temporar **nou** cu `Account / D1 / Read` și `Account / D1 / Edit` se va introduce direct în GitHub ca `PORTAL_D1_MIGRATE_TOKEN`; tokenul anterior `PORTAL_D1_READ_TOKEN` trebuie revocat/șters după verificarea de identitate. Nimeni nu transmite tokenul prin chat.
- `portal-v2-backend/scripts/migrate-phone.mjs` verifică la fiecare rulare contul, UUID-ul, numele și jurisdicția EU remote, cele trei hashuri SHA-256 ale fișierelor SQL și schema fără tabele de aplicație; numai în `apply` rulează migrațiile urmărite 0001–0003, apoi verifică cele 16 tabele. Dacă baza este deja negoală sau rezultatul eșuează, refuză să continue; nu repeta automat `apply` după eșec. `verify-remote-d1.mjs` acceptă mesajul informativ de proxy înaintea JSON-ului Wrangler.
- Testat local: **17 teste JavaScript trec**; pe D1 local nou și izolat `inspect` de schemă vede baza goală, migrațiile creează cele 16 tabele așteptate (excluzând `_cf_METADATA` intern). Nici workflow-ul de migrare, nici vreo migrație remote nu au rulat. Ghidul pentru telefon este `docs/portal-v2/cloudflare-phone-migrations.md`. Portalul live rămâne Appwrite.
- Următorul pas: proprietarul revocă vechiul token D1 Read și șterge secretul aferent, creează tokenul nou limitat și temporar, îl pune în `PORTAL_D1_MIGRATE_TOKEN`, rulează **întâi `inspect`** pe `main` și comunică linkul/statusul fără token. Verifică acea rulare înainte de `apply`. După `apply`, revocă și tokenul de migrare; apoi pregătește Workerul, secretul de autentificare, conturile fictive, backup/restore remote și QA mobil/Safari înainte de comutarea portalului. Nu repeta testele locale sau cercetarea platformei fără motiv concret.

### Stare la 25 septembrie 2026 — corecție minimă după `inspect` D1

- Proprietarul a rulat **numai `inspect`** pe `main`, cu confirmarea goală. A eșuat corect înaintea oricărei migrări: `Remote D1 is not empty`. Interogarea efectuată de proprietar în Cloudflare D1 Console a arătat ca unic tabel rămas după excluderea `_cf_METADATA` și `sqlite_%` pe `_cf_KV`, tabel intern D1. Nu s-a rulat `apply` și nu au fost modificate datele remote.
- În ramura draft, `migrate-phone.mjs` filtrează **numai** `_cf_METADATA` și `_cf_KV` din rezultatul listei de tabele. Orice tabel de aplicație (`clients`, `d1_migrations` etc.) și orice alt nume `_cf_*` necunoscut continuă să blocheze verificarea de bază goală. Același filtru este folosit și la validarea schemei după migrare; prefixul intern `sqlite_%` continuă să fie exclus în SQL. Documentația Cloudflare confirmă că `_cf_KV` este rezervat; nu s-au adăugat alte nume la excepții pe baza unor variante istorice neconfirmate în baza reală.
- Testat: **17/17 teste JavaScript trec**; testele noi includ răspuns D1 cu `_cf_KV` și `_cf_METADATA`, plus blocarea `clients`, `d1_migrations`, `_cf_UNRECOGNIZED` și verificarea celor 16 tabele finale. O probă locală izolată a confirmat că baza nouă trece verificarea, migrațiile locale creează cele 16 tabele, iar o bază populată este refuzată de gardă.
- Workflow-ul `.github/workflows/portal-d1-migrate.yml` de pe `main` și draft indică acum prin `ref` commitul revizuit `dc73c27bcaba041af3b34d018fa1d35583bd3d24`. Nicio migrare remote nu a fost aplicată și workflow-ul corectat nu a rulat încă. **Următorul pas exclusiv:** proprietarul rulează manual din nou `inspect` pe `main`, lasă confirmarea goală și se verifică rezultatul înainte de orice `apply`. Nu cere tokenul și nu repeta testele locale fără un defect nou. Portalul public rămâne Appwrite.

### Stare la 25 septembrie 2026 — a doua rulare `inspect` a trecut

- Proprietarul a pornit manual [rularea #2](https://github.com/petruandines/cleaning-services/actions/runs/36095477005) pe `main`, commitul workflow `50b6b5097408d81df138ed528c8300425cd7a2d8`, backend fixat `dc73c27bcaba041af3b34d018fa1d35583bd3d24`. Jobul `migrate` și pasul final au avut status **Success**.
- Din jurnalul GitHub Actions: `OPERATION: inspect`, `CONFIRMATION:` gol și `Verified remote D1 identity, EU jurisdiction, empty schema and the three pinned SQL files.` A fost numai verificarea de citire; **nu a rulat `apply`** și nu s-au aplicat migrații remote. Avertismentele GitHub despre versiunea Node pentru actions/checkout/setup-node și viitoarea versiune ubuntu-latest nu au blocat rularea.
- Următoarea etapă, numai după decizia proprietarului: rularea manuală `apply` pe `main` cu confirmarea exactă `APPLY 6816004b-dc95-48c9-be52-9bd4131d157e`. Scriptul repetă verificarea identității, a bazei fără tabele de aplicație și a hashurilor înaintea migrațiilor; dacă eșuează, nu relansa automat. După succes, revocă tokenul temporar și șterge secretul `PORTAL_D1_MIGRATE_TOKEN`; apoi vin conturile fictive, backupul remote cu restaurare distinctă, Workerul și QA. Portalul public rămâne pe Appwrite.

### Stare la 25 septembrie 2026 — migrațiile D1 inițiale au fost aplicate

- Proprietarul a pornit manual [rularea #3](https://github.com/petruandines/cleaning-services/actions/runs/36095944402) pe `main`. Jobul `migrate` și pasul `Inspect or apply the initial migrations` s-au încheiat **Success**. Jurnalul confirmă `OPERATION: apply`, `CONFIRMATION: APPLY 6816004b-dc95-48c9-be52-9bd4131d157e`, verificarea identității D1, jurisdicției EU, schemei goale și hashurilor SQL înainte de scriere, apoi `Initial D1 migrations applied; expected tables verified. No client data was inserted.` Trei migrații inițiale au fost aplicate. Nu relansa workflow-ul `apply`: baza nu mai este goală.
- Următoarele acțiuni: proprietarul revocă tokenul temporar de migrare în Cloudflare și șterge din GitHub Actions secretul `PORTAL_D1_MIGRATE_TOKEN` (și tokenul/secretul vechi `PORTAL_D1_READ_TOKEN`, dacă mai există). Niciun token nu se trimite în chat. Workerul nu este încă publicat, nu există conturi ori date reale introduse de acest workflow, backup/restore remote și QA mobil/Safari încă nu sunt făcute; portalul live `/cleaning-services/portal/` rămâne Appwrite. Continuă de la pregătirea Workerului și autentificării, teste fictive și backup/restore înainte de comutarea controlată.

### Stare la 25 septembrie 2026 — tokenul D1 Edit a fost retras

- Proprietarul a confirmat că a revocat în Cloudflare tokenul temporar folosit pentru `PORTAL_D1_MIGRATE_TOKEN` și că a șters secretul GitHub Actions cu același nume. Migrațiile inițiale rămân aplicate și verificate în [rularea #3](https://github.com/petruandines/cleaning-services/actions/runs/36095944402). Nu relansa `apply`.
- Pasul tehnic următor: pregătirea publicării Workerului și a autentificării, cu credențiale păstrate numai în secrete, urmate de date fictive, verificare backup și restaurare remote separată și QA înainte de schimbarea portalului public. Starea tokenului mai vechi `PORTAL_D1_READ_TOKEN` nu a fost reconfirmată; verifică doar dacă mai există, fără a presupune că a fost șters.

### Stare la 25 septembrie 2026 — prima publicare a Workerului pregătită, încă nerulată

- În ramura draft au fost adăugate `portal-v2-backend/scripts/deploy-phone.mjs`, testele și [ghidul pentru telefon](portal-v2/cloudflare-phone-worker.md). Wrangler a fost fixat la `4.102.0`, care acceptă `deploy --secrets-file`, astfel încât codul și `BETTER_AUTH_SECRET` să se publice împreună. **20/20 teste JavaScript trec**, `npm ci` și `wrangler deploy --dry-run` au trecut; dry-run nu publică Workerul.
- Workflow-ul manual `.github/workflows/portal-worker-deploy.yml` este pe `main` și ramura draft, fixat pe commitul revizuit `49dac5015b27414db8e494f2d28c9864238a5a0f`. `inspect` verifică UUID/nume/jurisdicție EU D1, exact cele 16 tabele, hashurile SQL, contul, subdomeniul și că Workerul nu există. `deploy` cere exact `DEPLOY petru-ines-portal-api`, secretul privat păstrat de proprietar și token Cloudflare temporar; la final testează login HTTP 200 și API anonim HTTP 401. Nu atinge pagina publică `portal/`, nu migrează date și nu creează conturi. Workflow-ul **nu a rulat încă** și Workerul nu a fost publicat.
- Următorul pas al proprietarului, numai pe telefon: generează și salvează privat o cheie aleatoare de cel puțin 48 de caractere și introduce aceeași valoare direct în GitHub secret `PORTAL_WORKER_AUTH_SECRET`; creează token Cloudflare temporar limitat la cont cu D1 Read și Workers Scripts Edit și îl pune direct în GitHub secret `PORTAL_WORKER_DEPLOY_TOKEN`. Mai întâi rulează manual doar `inspect` pe `main` cu confirmare goală; verifică jurnalul înainte de `deploy`. Dacă orice verificare eșuează, nu relansa automat. Nu cere valoarea secretelor în chat.
- După un deploy reușit, revocă tokenul Cloudflare temporar și șterge `PORTAL_WORKER_DEPLOY_TOKEN`, păstrând secretul Workerului și copia privată. Urmează bootstrapul unui administrator fictiv, verificarea TOTP, date de test, export/restore remote distinct și QA mobil/Safari înainte de comutarea portalului live Appwrite.

### Stare la 25 septembrie 2026 — secretul Workerului configurat de proprietar

- Proprietarul a confirmat că a generat și păstrat privat cheia Workerului, apoi a salvat-o direct în GitHub Actions secret `PORTAL_WORKER_AUTH_SECRET`. Valoarea nu a fost comunicată în chat și nu este verificată prin citire; confirmarea proprietarului este suficientă pentru pasul următor.
- Următorul pas: token Cloudflare temporar, limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu D1 Read și Workers Scripts Edit, introdus direct în GitHub secret `PORTAL_WORKER_DEPLOY_TOKEN`. Apoi se rulează **numai `inspect`**, cu confirmare goală. Workerul nu este încă publicat.

### Stare la 25 septembrie 2026 — tokenul temporar pentru Worker configurat

- Proprietarul a confirmat că a creat un token Cloudflare temporar pentru contul corect, cu D1 Read și Workers Scripts Edit, și l-a introdus direct în GitHub Actions secret `PORTAL_WORKER_DEPLOY_TOKEN`. Valoarea nu a fost comunicată în chat; nu se poate verifica din GitHub prin citire. `PORTAL_WORKER_AUTH_SECRET` fusese configurat separat și păstrat privat.
- Următorul pas exclusiv: pornește manual workflow-ul `Portal Worker first deployment (manual)` pe branch `main`, selectează `operation=inspect`, lasă `confirmation` gol. Verifică runul înainte de `deploy`; nu folosi Re-run. Workerul încă nu a fost publicat și portalul live încă folosește Appwrite.

### Stare la 25 septembrie 2026 — primul `inspect` Worker s-a oprit la token

- [Rularea #1](https://github.com/petruandines/cleaning-services/actions/runs/36097931762) a fost manuală pe `main`: `OPERATION: inspect`, `CONFIRMATION:` gol. Checkoutul fix, instalarea, **20 teste** și `wrangler deploy --dry-run` au trecut; pasul final a eșuat la prima comandă `wrangler d1 info --json` cu `Headers.set: "*** ... ***" is an invalid header value.` Jurnalul arată mascare pe mai multe linii, ceea ce indică probabil că valoarea secretului `PORTAL_WORKER_DEPLOY_TOKEN` conține caracter de rând nou ori alt caracter neacceptat în antet. Nu a început verificarea D1 remote, nu s-a publicat Workerul și nu s-au modificat datele Cloudflare.
- Proprietarul trebuie să înlocuiască valoarea secretului GitHub cu **numai tokenul brut** de pe o singură linie, fără `Bearer`, ghilimele, spații, comenzi curl sau rânduri noi. Dacă valoarea originală nu mai poate fi recuperată în siguranță, revocă tokenul vechi Cloudflare și creează unul nou cu aceleași permisiuni limitate. Nu trimite tokenul ori capturi cu valoarea în chat. După corectare rulează un `inspect` nou; nu `Re-run` și nu `deploy` până la un inspect de succes.

### Stare la 25 septembrie 2026 — tokenul Worker a fost corectat de proprietar

- După eroarea `Headers.set ... invalid header value` din rularea `inspect` #1, proprietarul a revocat vechiul token Cloudflare, a creat unul nou cu aceleași permisiuni și a confirmat actualizarea valorii secretului GitHub `PORTAL_WORKER_DEPLOY_TOKEN` doar cu șirul `cfut_...`, fără sintaxa comenzii curl. Nu s-a divulgat tokenul integral în chat. Corecția nu a fost încă probată de workflow.
- Pas imediat: pornește o rulare **nouă** a `Portal Worker first deployment (manual)` pe `main`, `operation=inspect`, `confirmation` gol; verifică jurnalul. Nu porni `deploy` înainte de inspect reușit. Workerul nu este publicat.

### Stare la 25 septembrie 2026 — `inspect` Worker a trecut

- Proprietarul a pornit manual [rularea #2](https://github.com/petruandines/cleaning-services/actions/runs/36107025902) pe `main`, cu `OPERATION: inspect` și `CONFIRMATION:` gol. Jobul `worker` și pasul final au avut **Success**; 20/20 teste au trecut, dry-run a compilat Workerul, iar jurnalul arată `Verified EU D1 identity, 16 expected tables, locked SQL, account, Workers subdomain, and unused Worker name.` Nu a fost făcut niciun deploy ori scriere în D1. Workerul rămâne nepublicat, portalul live rămâne pe Appwrite.
- Următorul pas: proprietarul pornește o rulare **nouă** a aceluiași workflow manual pe `main`, `operation=deploy`, cu confirmarea exactă `DEPLOY petru-ines-portal-api`. Fluxul reface verificările înainte de publicare, urcă `BETTER_AUTH_SECRET` alături de cod și verifică HTTP 200 pe login și HTTP 401 pentru API anonim. Dacă runul eșuează, nu relansa automat; poate exista deja un Worker publicat. După succes, revocă tokenul temporar și șterge numai `PORTAL_WORKER_DEPLOY_TOKEN`; păstrează `PORTAL_WORKER_AUTH_SECRET` și copia privată.

### Stare la 25 septembrie 2026 — Worker publicat, verificare inițială fals negativă

- Proprietarul a pornit [rularea `deploy` #3](https://github.com/petruandines/cleaning-services/actions/runs/36107298718) cu confirmarea exactă `DEPLOY petru-ines-portal-api`. Cele 20 teste, dry-run și toate verificările remote au trecut. `wrangler deploy --secrets-file` a ieșit cu succes, dar pasul final a marcat jobul **roșu** pentru că testul imediat a primit HTTP 404 pe `/login.html` și `/api/me`. **Nu relansa `deploy`: Workerul există acum.**
- După scurtul interval de propagare, verificarea publică independentă, fără token sau autentificare, a obținut HTTP **200** pe `https://petru-ines-portal-api.petruandines.workers.dev/login` și `{"error":"unauthorized"}` cu HTTP **401** pe `/api/me`. Browserul a confirmat redirecționarea normală de la `/login.html` la `/login`; vechiul smoke check cerea `redirect: error` și nu aștepta propagarea, producând falsul negativ. Aceasta arată că Workerul și restricția accesului anonim funcționează; nu dovedește încă un login real sau toate fluxurile D1.
- În ramura draft, `verify-worker-phone.mjs` și testul său folosesc `/login`, acceptă redirecționarea și reîncearcă verificarea publică. **21/21 teste JavaScript trec**, iar verificarea publică live a trecut din executor. Workflow-ul manual **read-only** `.github/workflows/portal-worker-verify.yml` există pe `main` și draft, fixat la commitul `5361df18875e74af136d630c5cb5b28e2e5afea2`, fără credențiale, ca să confirme public de pe GitHub Actions. Acest workflow încă nu a rulat.
- Următorul pas sigur: pornește manual **numai** `Portal Worker public verification (read only)` pe `main`, fără intrări sau token; verifică logul. După succes, revocă tokenul temporar `PORTAL_WORKER_DEPLOY_TOKEN` în Cloudflare și șterge secretul cu același nume în GitHub; **păstrează** `PORTAL_WORKER_AUTH_SECRET` și copia privată. Portalul live `/cleaning-services/portal/` rămâne pe Appwrite. Nu sunt conturi reale, backup/restore remote și QA browser încă realizate.

### Stare la 25 septembrie 2026 — verificarea publică a Workerului a trecut

- Proprietarul a pornit manual [rularea read-only #1](https://github.com/petruandines/cleaning-services/actions/runs/36107899006) pe `main`. Jobul `verify` este **Success**; testul verificatorului a trecut și jurnalul confirmă `Worker verified: Petru & Inés login HTTP 200; anonymous API HTTP 401. No data changed.` Workflow-ul nu primește niciun secret Cloudflare și nu face scrieri. Workerul este publicat la `https://petru-ines-portal-api.petruandines.workers.dev` pentru testare, dar loginul efectiv/TOTP nu au fost încă testate remote.
- Următorul pas imediat de securitate: proprietarul revocă tokenul temporar Cloudflare pentru Worker și șterge numai secretul GitHub `PORTAL_WORKER_DEPLOY_TOKEN`; **păstrează** `PORTAL_WORKER_AUTH_SECRET` și copia privată pentru a nu rupe autentificarea. Nu relansa workflow-ul de prima publicare. Ulterior pregătește bootstrap administrativ fictiv și verifică autentificarea în browser, backup/restore remote într-o bază distinctă și QA mobil/Safari. Portalul live rămâne pe Appwrite.


### Stare la 25 septembrie 2026 — pregătit primul administrator de pe telefon

- Proprietarul a confirmat că păstrează cheia `PORTAL_WORKER_AUTH_SECRET` și o cunoaște; aceasta este cheia Workerului, **nu** parola contului administrator. Verificarea publică a Workerului din rularea `36107899006` rămâne verde. Nu avem confirmare independentă despre ștergerea tokenului temporar de deploy.
- În PR #1, `scripts/admin-phone.mjs`, testele `test/admin-phone.test.mjs` și ghidul `docs/portal-v2/cloudflare-phone-admin.md` pregătesc `inspect` (read-only) și `create` (un singur administrator) folosind GitHub Actions. Workflow-ul `.github/workflows/portal-admin-bootstrap.yml` există pe `main` și draft; face checkout la commitul revizuit `585b36e87cded5e2e10d79c4cdb3df65546f7346`. Verifică repository/branch, contul Cloudflare, UUID/nume/jurisdicția EU, Workerul configurat, hashurile fișierelor SQL, cele 16 tabele, istoricul exact al celor trei migrații și absența datelor în celelalte 15 tabele. `create` cere confirmarea exactă cu UUID și adresa administratorului, generează hashul privat și importă fără tranzacția SQL imbricată; verifică apoi exact un user/admin și o parolă hashuită. La eroare nu relansa automat.
- **24/24 teste JavaScript au trecut** local; workflow YAML și commitul fix au fost verificate. Verificarea opțională prin `d1 migrations apply --local` a fost blocată de controlul automat al mediului, care a tratat comanda `apply` ca operație neautorizată; nu a fost relansată. Structura tabelului `d1_migrations` și stocarea numelor au fost confirmate prin citirea codului Wrangler 4.102.0. Niciun workflow pentru administrator nu a rulat; nu s-a modificat D1.
- Pasul următor de pe telefon: proprietarul alege **adresa proprie** și o parolă **nouă** (separată de cheia Workerului), o salvează privat, creează token temporar D1 Read/Edit limitat la cont, adaugă GitHub secrets `PORTAL_D1_ADMIN_TOKEN` și `PORTAL_ADMIN_INITIAL_PASSWORD`; rulează **numai** `inspect` pe `main`, cu confirmare goală. Verifică jurnalul înainte de `create`. După creare, revocă tokenul și șterge cele două secrete temporare; păstrează parola și cheia Workerului. Portalul public este în continuare Appwrite; urmează login/TOTP în browser, date fictive, backup/restore remote și QA.


### Stare la 25 septembrie 2026 — primul `inspect` pentru administrator a trecut

- Proprietarul a creat un token temporar Cloudflare D1 Edit limitat la cont și l-a salvat în GitHub secret `PORTAL_D1_ADMIN_TOKEN`. Parola nouă pentru administrator a fost aleasă și păstrată privat; nu a fost transmisă în chat sau introdusă încă în GitHub.
- [Rularea #1 `Portal first administrator (manual)`](https://github.com/petruandines/cleaning-services/actions/runs/36110156320) pe `main` s-a terminat **Success**. Logul arată `OPERATION: inspect`, `ADMIN_EMAIL: petruandines@gmail.com`, `CONFIRMATION:` gol și `Verified EU D1 identity, migration hashes and history, exact schema, and empty account/application tables.` Pasul `create` a fost **skipped**, deci nu s-a creat niciun cont și D1 nu a fost modificată.
- Pasul următor de pe telefon: proprietarul introduce **parola nouă aleasă, nu cheia Workerului**, direct în GitHub Actions secret `PORTAL_ADMIN_INITIAL_PASSWORD`; apoi poate porni o nouă rulare cu `operation=create`, aceeași adresă și confirmarea exactă `CREATE ADMIN 6816004b-dc95-48c9-be52-9bd4131d157e petruandines@gmail.com`. Dacă eșuează, nu relansa `create`; verifică starea mai întâi. După succes revocă tokenul temporar și șterge ambele secrete temporare. Portalul public rămâne Appwrite.
