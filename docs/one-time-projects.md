# Intervenții punctuale · Petru & Inés

## Utilizare

Adminul intră în portal, cu autentificarea și verificarea în doi pași existente,
apoi deschide **Intervenții punctuale** din meniu, în aceeași filă.
Pagina separată este `/portal/projects/`; aceasta reutilizează sesiunea admin
din filă și verifică autorizarea pe server pentru fiecare cerere.

1. Adaugă proiectul, prețul în lei și checklist-ul. Datele sunt interpretate în
   `Europe/Bucharest`, indiferent de fusul dispozitivului adminului.
2. Alege durata accesului de la finalizare (implicit 7 zile; personalizat 1–3650,
   sau niciodată). Locația poate fi ascunsă clientului.
3. Generează accesul și setează o parolă de minimum 12 caractere. Parola se poate
   genera și copia înainte de salvare. După salvare nu se mai poate recupera.
4. Copiază linkul `/portal/project/?token=<64 caractere hex>`; trimite parola separat.
5. Începe intervenția, bifează sarcinile, apoi confirmă finalizarea.
6. Finalizarea afișează review-ul Google și fixează `completed_at`.

Clientul vede doar datele publice ale proiectului; telefonul, emailul, numele
clientului, logurile și câmpurile de acces nu sunt trimise către client.
Factura este un link HTTPS extern, fără un sistem nou de facturare.
Actualizările se verifică la 15 secunde și la revenirea în filă.

## Fișiere și integrare

În `main`: fișiere noi în `portal/projects/`, `portal/project/`,
`portal/project-view.mjs`, `portal/projects.css`, testul
`portal-v2-frontend/test/one-time-ui.test.mjs` și acest document.
În `portal/app.js` și copia sursă `portal-v2-frontend/app.js` se adaugă numai
linkul de navigare vizibil adminului. Nicio pagină publică existentă nu este editată.

Backend-ul este păstrat în branch-ul `feat/one-time-projects`, pornit exact din
versiunea funcțională `2060d84af71fa271c7c69031dfd8b4ced2134e48`.
Sursa publicată este fixată la `927dc5e65f1aba5de2f674d916311214f9e78775`.
Modificarea în `src/index.mjs` adaugă numai dispatch-ul prefixului nou;
autentificarea existentă, API-ul recurent și configurarea Worker nu sunt rescrise.

Workflow-ul existent `portal-cascade-delete-once.yml` este actualizat să testeze
backend-ul și interfața, să creeze structurile dedicate, apoi să publice Worker-ul.
Rutarea de producție, domeniile, binding-ul DB, secretul de autentificare,
deployment-ul Pages și redirect-urile existente sunt păstrate.

## Date și endpoint-uri

Tabele noi, fără foreign keys spre clienții sau userii existenți:

- `one_time_projects`: date, status, preț în bani, timestamps, versiune și termen.
- `one_time_project_tasks`: checklist ordonat, bifare și timestamp.
- `one_time_project_access`: token, hash parolă, activare, generație și expirare.
- `one_time_project_sessions`: numai hash-ul tokenului de sesiune, termen și generație.
- `one_time_project_activity`: tip, actor, timestamp și detaliu; fără secrete.
- `one_time_project_rate_limits`: contoare temporare pentru limitarea login-urilor.

Trei indexuri noi pentru taskuri, sesiuni și jurnal.
SQL-ul dedicat folosește exclusiv `CREATE TABLE/INDEX IF NOT EXISTS`.
Nu se execută migrațiile istorice ale portalului și nu se modifică datele existente.
Scriptul de deployment verifică identitatea D1 și definițiile schemei existente.

| Endpoint | Metode / scop |
| --- | --- |
| `/api/one-time/admin` | GET listă paginată; POST creare |
| `/api/one-time/admin/:id` | GET detalii; PATCH proiect și checklist |
| `/api/one-time/admin/:id/preview` | GET exact payload-ul clientului; numai admin |
| `/api/one-time/admin/:id/activity` | GET jurnal paginat |
| `/api/one-time/admin/:id/access` | POST generate/reset/revoke/reactivate |
| `/api/one-time/admin/:id/start` | POST începe intervenția |
| `/api/one-time/admin/:id/complete` | POST finalizează cu confirmare explicită |
| `/api/one-time/client/:token/login` | POST parolă și opțiune remember |
| `/api/one-time/client/:token/view` | GET proiect după verificarea sesiunii |
| `/api/one-time/client/:token/logout` | POST invalidează sesiunea |

## Autentificare și expirare

Tokenurile linkului și sesiunii folosesc 32 bytes aleatorii criptografic.
Parolele folosesc `hashPassword`/`verifyPassword` din Better Auth, compatibil cu
backend-ul existent. Parola nu apare în URL, storage sau loguri.
Cookie host-only pe API: `__Secure-pi-project`, Secure, HttpOnly, SameSite=Lax,
cu Path separat pentru tokenul proiectului. Originea portalului și API-ul sunt
same-site; noul endpoint folosește CORS cu credentials pentru originile existente
permise. Mutațiile verifică Origin; adminul folosește bearer-ul existent.

Sesiunea este reutilizabilă maximum 30 de zile. Cu remember bifat, cookie-ul are
Max-Age; fără remember este cookie de sesiune al browserului. Expirarea accesului
și generația se verifică pe server la fiecare citire; revocarea, resetarea parolei,
regenerarea și reactivarea invalidează toate sesiunile precedente.

`expires_at = completed_at + expiry_days`. Nu există termen de acces calculat de
la creare. Cu „niciodată”, accesul nu expiră automat, dar sesiunea are în continuare
limita de 30 de zile. Proiectul se păstrează în istoric după expirare.

Nu este necesar cron: accesul este refuzat imediat după termen, la fiecare cerere.
Evenimentul de expirare se înscrie când serverul verifică un acces expirat sau când
adminul deschide modulul. Timestamp-ul evenimentului este termenul efectiv.
Pentru reactivarea unui acces deja expirat, adminul schimbă întâi durata la o dată
viitoare sau „niciodată”; simpla reactivare nu ocolește termenul configurat.

Login-ul este limitat la 10 încercări/minut/IP și 30/minut/link. Blocarea durează
maximum un minut; contoarele expirate sunt curățate. Maximum 500 taskuri/proiect;
listele de proiecte și jurnal sunt paginate.

Linkul Google Review este centralizat în `src/one-time.mjs` (`REVIEW_URL`).
Se livrează numai după finalizarea confirmată, în status Finalizată/Închisă.

## Verificare

92 teste backend (87 existente + 5 noi), 10 teste frontend (8 existente + 2 noi),
3 teste rutare. Testul UI folosește DOM-ul real, API-ul nou și SQLite cu schema D1;
autentificarea adminului este simulată numai în acest test. Testele existente ale
autentificării folosesc Better Auth real și verifică inclusiv TOTP și prima parolă.

Scenariile noi acoperă creare, acces cu parolă, reutilizarea cookie-ului,
checklist și timestampuri, progres, începere/finalizare, review conditionat,
factură, logout, revocare/reactivare, token nou, resetare, expirare, izolare față de
alt proiect/dashboard recurent, autorizare preview, brute-force, CSRF și validare.
Build-ul static verifică toate linkurile locale; Worker-ul este compilat dry-run.

Deployment-ul rulează și smoke HTTP pe API-ul live: creează numai fixtures fictive
în tabelele noi, verifică login/cookie, payload, progres, review, factură, revocare,
logout și expirare, apoi elimină exclusiv aceste fixtures. Schimbările de status
ale fixture-ului live se fac prin SQL; acțiunile API ale adminului sunt testate în
testele locale/UI. Nu se folosește și nu se resetează parola unui cont real.

## Rollback

Revert al commitului de integrare din `main`, care restaurează workflow-ul cu
backend-ul fixat la `2060d84af71fa271c7c69031dfd8b4ced2134e48` și elimină linkul
modulului din portal. Publicarea folosește aceleași workflow-uri existente.
Nu șterge tabelele noi: acestea păstrează istoricul pentru o eventuală repunere
în funcțiune și nu afectează funcțiile recurente.
Versiunea `main` funcțională înainte de integrare:
`b52a3d8e991003c58e442ca7c8575bd108cc18bb`.
