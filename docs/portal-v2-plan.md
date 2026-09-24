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
