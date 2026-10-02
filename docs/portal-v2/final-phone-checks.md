# Verificări finale pe telefon, înainte de înlocuirea portalului public

Previzualizare: https://petruandines.github.io/cleaning-services/portal-v2-frontend/

## Cont client

Folosește un cont de client deja creat în portalul nou. Nu trimite parola în chat.

1. Ieși din admin și autentifică-te ca primul client.
2. Verifică locațiile, programările, plățile și mesajele: trebuie să fie numai ale acestui client.
3. Verifică tabul Contract: numai câmpurile completate sunt afișate; dacă nu sunt informații, tabul lipsește.
4. Verifică Draft și programările confirmate; descarcă .ics pentru o locație și apoi toate locațiile.
5. Verifică plata cu mai multe locații: o singură sumă totală; în Excel, o singură înregistrare pentru acea plată.
6. Trimite un mesaj de probă către admin, apoi verifică răspunsul în același cont.
7. Ieși și intră ca al doilea client, dacă există: istoricul și mesajele primului client nu trebuie să apară.
8. După logout, reîncărcarea paginii nu trebuie să arate datele contului precedent.

## Înainte de comutare

- Confirmă ce date reale există în Appwrite și dacă trebuie transferate; nu înlocui portalul public înainte de inventariere.
- Backup schema 0009 demonstrat, ZIP descărcat și cheie păstrată separat.
- Workflow săptămânal testat printr-o rulare manuală; rezultat și arhivă verificate. Programarea este configurată duminică 02:00 UTC, dar execuția programată trebuie confirmată ulterior printr-o rulare reală.
- Păstrează versiunea veche a interfeței pentru revenire; pregătește autentificarea nouă și legăturile înainte de publicare.
- Șterge accesul temporar de migrare/deploy după verificări; cheia permanentă Worker rămâne. Backupul săptămânal are nevoie de tokenul de export și cheia din GitHub; nu elimina aceste secrete cât timp workflow-ul este activ.
- Nu șterge Appwrite în această etapă.
