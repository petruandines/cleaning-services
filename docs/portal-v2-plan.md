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

## Modelul de date v1, de implementat după decizia de autentificare

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
2. Creăm în repository privat backendul, schema D1 și migrațiile; rulăm teste locale cu două identități client și una staff.
3. Implementăm API-ul și autentificarea; testăm accesul direct la ID-ul altui client, schimbarea parolei, revocarea sesiunii, rate limit și 2FA admin.
4. Refacem interfața existentă pentru noul API, scoatem ecranele de facturi/documente, adăugăm trimiterea mesajelor și gestionarea programărilor; verificăm pe mobil.
5. Configurăm D1 UE, secrete, Worker și backup; executăm export + restaurare într-o bază separată. Abia după acestea conectăm interfața la clienți reali.
6. Lansăm prin comutare controlată. Păstrăm Appwrite până când noul portal funcționează și datele migrate sunt verificate.

## Protocol de reluare cu consum redus de credite Work

La o sesiune nouă: citește mai întâi **acest fișier**, `portal/README.md` și ultimele commit-uri/PR-uri din proiect. Verifică starea curentă din cod; nu reface comparația de platforme, schema sau cercetarea de prețuri fără un motiv concret. Lucrează într-un singur pas verificabil pe sesiune, actualizează aici: **finalizat / testat / următorul pas / blocaje / commit sau PR**. Încheie înainte de limita de credite cu un commit al lucrului valid și cu blocajele scrise clar. Nu trece la implementarea loginului sau la date reale pe baza unei presupuneri.

### Stare la 24 septembrie 2026

- Finalizat: decizia URL; schema aplicației cu 8 tabele și schema Better Auth 1.7.5 generate în `docs/portal-v2/`; Worker API în `portal-v2-backend/`, inclusiv configurare de autentificare și teste. Toate sunt numai în ramura `codex/portal-v2-plan`; site-ul publicat folosește încă Appwrite.
- Testat: ambele migrații aplicate în D1 local cu Wrangler; 3 teste API trec (anonim și origin străin respins, client A/B izolați, mesajul nu acceptă `client_id` falsificat); compilarea Workerului trece cu `wrangler deploy --dry-run`. Testul local interactiv `wrangler dev` nu a putut porni aici din cauza erorii mediului `uv_interface_addresses`. Autentificarea reală și Cloudflare remote nu sunt încă testate.
- Următorul pas: test autentic Better Auth + D1 cu două conturi fictive și unul staff într-un mediu în care `wrangler dev` pornește; implementarea completă a creării conturilor și a 2FA, backup criptat/restaurare, apoi conectarea interfeței de pe GitHub Pages și testele de browser. Codul backend este în repository-ul public fără secrete; permisiunile trebuie să rămână exclusiv server-side.
- Blocaje pentru deployment: contul Cloudflare nu este conectat la această sesiune; D1 UE și URL-ul Worker încă nu există. Nu publica Workerul sau noul login până la testele reale, backup și restore. `BETTER_AUTH_SECRET` trebuie setat ca secret, iar valorile `REPLACE_WITH_*` din `wrangler.jsonc` înlocuite numai la configurare.
