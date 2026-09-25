# Primul administrator din telefon

Urmează această procedură **numai după** ce Workerul răspunde la `/login` cu HTTP 200 și D1 conține cele trei migrații inițiale. Portalul public GitHub Pages rămâne pe Appwrite în această etapă.

1. Stabilește adresa de e-mail **a ta**, pe care o vei folosi pentru primul cont de administrator. Introdu-o cu litere mici, fără spații. Nu introduce aici adrese de e-mail ale clienților.
2. Creează o parolă **nouă** de 12–128 de caractere, pe o singură linie. Salveaz-o în managerul tău de parole sub „Portal Petru & Inés – administrator”. Nu folosi cheia `PORTAL_WORKER_AUTH_SECRET` ca parolă. Nu trimite parola în chat.
3. În Cloudflare, creează un token temporar limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu `Account → D1 → Read` și `Account → D1 → Edit`. Copiază doar valoarea brută a tokenului, fără `Bearer`, `curl`, ghilimele sau spații. În GitHub → repository `petruandines/cleaning-services` → Settings → Secrets and variables → Actions, adaugă tokenul drept secret `PORTAL_D1_ADMIN_TOKEN`. Secretul acesta este diferit de `PORTAL_WORKER_AUTH_SECRET`.
4. În același loc GitHub, adaugă parola nouă drept secret `PORTAL_ADMIN_INITIAL_PASSWORD`. Managerul de parole este copia ta; secretul GitHub va fi șters după crearea contului.
5. În GitHub → Actions → `Portal first administrator (manual)` → Run workflow, selectează `main`, operația `inspect`, introdu adresa ta la `admin_email` și lasă `confirmation` gol. Rulează și verifică mesajul de succes `Verified EU D1 identity, migration hashes and history, exact schema, and empty account/application tables.` Dacă apare roșu, oprește-te și consultă jurnalul; nu rula `create`.
6. După un `inspect` reușit, pornește o rulare **nouă** a aceluiași workflow pe `main`, cu operația `create`, aceeași adresă și confirmarea exactă `CREATE ADMIN 6816004b-dc95-48c9-be52-9bd4131d157e adresa@ta.example`, înlocuind numai adresa. Verifică mesajul `One administrator and one credential account verified; no client records created.` Dacă apare roșu, **nu repeta `create`**; contul poate exista deja și trebuie inspectată starea D1.
7. După succes, revocă în Cloudflare tokenul temporar și șterge **numai** secretele GitHub `PORTAL_D1_ADMIN_TOKEN` și `PORTAL_ADMIN_INITIAL_PASSWORD`. Păstrează parola în managerul de parole și păstrează `PORTAL_WORKER_AUTH_SECRET`.

Rularea `inspect` citește identitatea D1, jurisdicția UE, schema, istoricul migrațiilor și verifică faptul că tabelele de cont și aplicație nu conțin înregistrări. `create` reface verificările și importă un singur cont cu parolă hashuită. SQL-ul privat este șters de pe runner; parola, hashul și fișierul SQL nu sunt afișate în jurnal.

Testul de autentificare din telefon și activarea TOTP urmează separat, înainte de crearea conturilor fictive și a backupului remote. Nu comuta portalul public pe noul Worker înainte de aceste probe.
