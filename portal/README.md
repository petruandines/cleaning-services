# Portal Petru & Inés — prima etapă

Interfață statică GitHub Pages, ruta `/cleaning-services/portal/`, conectată la Appwrite Frankfurt.

## Implementat

- Autentificare e-mail/parolă și deconectare prin SDK oficial Appwrite 27.0.0.
- Recunoaștere staff prin membership confirmat, verificat cu identitatea autentificată.
- Administrator: creare cont client prin Function `create-client`, vizualizare clienți, programări, intervenții, facturi, locații, mesaje și note interne.
- Client: vizualizare rânduri permise de Appwrite; fără interfață de administrare și fără note interne.
- Facturi: download autentificat cu JWT temporar în antet; fără JWT în URL sau stocat separat; PDF descărcat ca blob.
- Sume afișate în lei; date în fusul Europe/Bucharest; paginare 20 înregistrări.
- Texte din baza de date randate prin textContent; CSP; fără analytics, CDN sau API key în frontend.
- SDK-ul gestionează sesiunea și fallback-ul său standard dacă browserul blochează cookie-urile terțe.

## Build și teste

Node 22. `npm ci`, `npm run test:portal`, `npm run build:portal`.
Fișierul generat `portal/app.js` este inclus în git, pentru workflow-ul static existent. După modificarea surselor, reconstruiește și comite bundle-ul. Testele locale folosesc un SDK simulat; nu demonstrează izolarea datelor în proiectul live.

## Configurație

Endpoint, project ID și numele resurselor publice sunt în `src/domain.mjs`.
În Appwrite Apps trebuie înregistrat exact hostname-ul `petruandines.github.io`, fără wildcard.
Permisiunile serverului sunt autoritatea finală. Nu acorda read global pentru users sau any ca să rezolvi o problemă de UI.
La fiecare rând/file nou, serverul/adminul trebuie să acorde read doar utilizatorului proprietar. `visible_to_client` singur nu restricționează accesul: la programările interne nu trebuie acordată permisiunea clientului.

## Înainte de utilizarea cu clienți reali

1. Confirmă login real admin, creare PF/PJ prin Function și comportamentul la retry.
2. Testează două conturi client: fiecare vede numai rândurile și PDF-urile proprii; accesul direct la ID-ul celuilalt este refuzat; clientul nu poate executa create-client sau citi internal_notes.
3. Testează PDF și login pe mobil cu cookie-uri terțe blocate.

## Etapa următoare

Crearea/modificarea programărilor, calendar disponibilitate cu prevenirea rezervărilor suprapuse, încărcarea facturilor și trimiterea mesajelor în portal nu sunt încă implementate. Ecranele lor sunt de consultare în această versiune. Solicitările pot fi trimise prin contactul WhatsApp existent. Nu există date demonstrative în baza reală.
