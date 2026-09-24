# Portal API — draft, nu este publicat

Interfața rămâne la `https://petruandines.github.io/cleaning-services/portal/`.
Acest Worker va primi cereri de pe acel origin. Codul nu conține credentiale; 
`BETTER_AUTH_SECRET` se setează ca Worker secret, niciodată în repository.

## Stare

- Schema aplicației: `../docs/portal-v2/0001_app_schema.sql`. Schema Better Auth 1.7.5: `../docs/portal-v2/0002_auth.sql`, generată cu `BETTER_AUTH_SECRET=<valoare temporară> npm run generate:auth`. `../docs/portal-v2/0003_portal_accounts.sql` blochează accesul până la schimbarea parolei inițiale. Toate trei au fost aplicate în D1 local.
- API: citire filtrată după sesiune, mesaje de la client și echipă, creare de client, locație, programare, lucrare și plată de către echipă. Scrierile sunt validate, verifică legăturile cu același client și înregistrează auditul în aceeași tranzacție D1. Datele staff sunt blocate până la activarea TOTP.
- Autentificarea din `public/login.html` rulează pe originul Workerului, iar interfața de previzualizare din `../portal-v2-frontend/` primește tokenul prin `postMessage` cu verificarea originului, ferestrei și unui cod aleator. Tokenul rămâne **numai în memorie**: reîncărcarea paginii cere login nou.
- Interfața de previzualizare include formulare staff, căutarea clientului, paginare și deschiderea unei ferestre Worker pentru crearea conturilor. Parolele sunt introduse în ferestrele Worker, nu în formularele GitHub Pages. Clientul creat este legat de clientul selectat și vede datele numai după schimbarea parolei inițiale; sesiunile vechi sunt revocate.
- `disableSignUp` oprește înscrierea publică. `scripts/bootstrap-admin.mjs` pregătește offline administratorul inițial; nu introduce parola sau fișierul SQL în repository. **Nu am importat conturi pe Cloudflare și nu am verificat fluxul într-un browser real.** Backupul și testul end-to-end remote nu sunt încă finalizate.
- `wrangler.jsonc` conține intenționat substituenți. Nu executa deploy până când D1 cu jurisdicție UE, migrațiile, secretul și rate limiting sunt verificate.

## Verificare locală

`npm ci && npm test`. Suitele includ un flux autentic Better Auth pe SQLite în memorie: parolă, activare TOTP, creare cont client, schimbarea parolei inițiale, revocarea sesiunilor și logout; testul de bootstrap importă SQL-ul generat într-o altă bază de test. Verificarea în browser și pe D1 remote rămâne necesară.

## Pregătirea administratorului, după configurarea D1 UE

Rulează doar după aplicarea migrațiilor `0001`, `0002`, `0003` în această ordine și după verificarea faptului că nu există deja un administrator. Pe un calculator controlat, setează `umask 077`, citește parola fără afișare (`read -rs PORTAL_ADMIN_PASSWORD`), apoi:

```bash
printf '%s\n' "$PORTAL_ADMIN_PASSWORD" | node scripts/bootstrap-admin.mjs --email ADRESA_ADMIN --name "Petru & Inés" --out /cale-privată/admin.sql
unset PORTAL_ADMIN_PASSWORD
```

Fișierul conține hashul parolei și are permisiuni `0600`; nu conține parola în clar. Verifică fișierul și, când baza remote este pregătită, importă-l o singură dată cu Wrangler `d1 execute --remote --file` în baza corectă, verifică autentificarea și activarea TOTP, apoi șterge fișierul SQL temporar. Nu rula comanda cu parola ca argument și nu publica fișierul.

## Pașii următori

1. Testează autentificarea cu două conturi fictive și unul staff într-un mediu cu Wrangler funcțional; verifică izolarea și logarea cu 2FA.
2. Testează în browser ferestrele de login și de creare cont, schimbarea parolei inițiale și formularele staff. Interfața nouă este momentan o previzualizare în `portal-v2-frontend/`; pagina publică `portal/` nu a fost modificată.
3. Configurează adresa Workerului după alocare, testează fluxul browser pe mobil/Safari și execută exportul criptat plus restaurarea D1 înainte de date reale sau deploy public.
