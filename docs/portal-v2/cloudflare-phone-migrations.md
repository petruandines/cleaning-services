# Migrațiile inițiale D1 de pe telefon — Petru & Inés

**Stare:** flux pregătit, însă migrațiile remote nu au fost pornite. Baza `petru-ines-portal-eu` are UUID-ul `6816004b-dc95-48c9-be52-9bd4131d157e`, iar verificarea identității ei pe contul Cloudflare a reușit [în rularea read only](https://github.com/petruandines/cleaning-services/actions/runs/36050649911). Portalul live folosește încă Appwrite.

## Din telefon

1. Revocă vechiul token `D1 / Read` din Cloudflare și șterge secretul GitHub `PORTAL_D1_READ_TOKEN` după ce ai terminat cu verificarea identității.
2. În Cloudflare → My Profile → API Tokens → Create Token → Custom token, creează **un token nou, temporar**, cu numai permisiunile `Account / D1 / Read` și `Account / D1 / Edit`, limitat la contul `47b9f8498a9865c0fbbaca8f0f5cf59d`, cu expirare scurtă (de exemplu, o zi). Aceste permisiuni se acordă la nivel de **cont**, deci tokenul este sensibil: nu îl trimite în chat ori în capturi.
3. În [GitHub → Settings → Secrets and variables → Actions](https://github.com/petruandines/cleaning-services/settings/secrets/actions) → New repository secret, salvează tokenul sub numele exact `PORTAL_D1_MIGRATE_TOKEN`. Valoarea nu trebuie să apară în cod sau mesaje.
4. În [GitHub Actions → Portal D1 initial migrations (manual)](https://github.com/petruandines/cleaning-services/actions/workflows/portal-d1-migrate.yml), apasă **Run workflow**, selectează `main`, lasă `operation: inspect` și câmpul `confirmation` gol. Așteaptă statusul **Success** și mesajul `Verified remote D1 identity, EU jurisdiction, empty schema and the three pinned SQL files.`. Dacă apare o eroare, oprește-te și trimite doar mesajul erorii sau linkul rulării, niciodată tokenul.
5. Numai după `inspect: Success`, pornește din nou workflow-ul pe `main`, selectează `operation: apply` și introdu exact în câmpul `confirmation`:

   `APPLY 6816004b-dc95-48c9-be52-9bd4131d157e`

   Urmărește statusul **Success** și mesajul `Initial D1 migrations applied; expected tables verified. No client data was inserted.`. Dacă apare o eroare, nu relansa automat `apply`: există posibilitatea unei aplicări parțiale, iar baza trebuie inspectată întâi.
6. Revocă tokenul de migrare în Cloudflare și șterge secretul `PORTAL_D1_MIGRATE_TOKEN` din GitHub.

Workflow-ul rulează doar manual și doar pe `main`, citește un commit fixat al backendului, testează gardele, compară UUID-ul, numele și jurisdicția EU, verifică cele trei fișiere SQL prin SHA-256 și refuză să migreze o bază care are tabele de aplicație. În `inspect` nu aplică niciun SQL. În `apply`, Wrangler aplică migrațiile urmărite `0001`–`0003` și face un backup D1 al migrației, conform documentației Cloudflare; acesta nu înlocuiește exportul criptat în afara Cloudflare. Nu introduce date reale, nu creează administratorul, nu publică Workerul și nu schimbă `portal/`.
