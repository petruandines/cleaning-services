# Portal API — draft, nu este publicat

Interfața rămâne la `https://petruandines.github.io/cleaning-services/portal/`.
Acest Worker va primi cereri de pe acel origin. Codul nu conține credentiale; 
`BETTER_AUTH_SECRET` se setează ca Worker secret, niciodată în repository.

## Stare

- Schema aplicației: `../docs/portal-v2/0001_app_schema.sql`. Schema Better Auth 1.7.5: `../docs/portal-v2/0002_auth.sql`, generată cu `BETTER_AUTH_SECRET=<valoare temporară> npm run generate:auth`. Ambele au fost aplicate cu Wrangler în D1 local.
- API inițial: citire filtrată după sesiune, mesaj text de la client; datele staff sunt blocate până la activarea TOTP.
- Autentificarea din `public/login.html` rulează pe originul Workerului, iar interfața de previzualizare din `../portal-v2-frontend/` primește tokenul prin `postMessage` cu verificarea originului, ferestrei și unui cod aleator. Tokenul rămâne **numai în memorie**: reîncărcarea paginii cere login nou.
- `disableSignUp` oprește înscrierea publică. Administratorul inițial, crearea utilizatorilor, schimbarea parolei inițiale, operațiile staff, backupul și testul end-to-end **nu sunt încă finalizate**.
- `wrangler.jsonc` conține intenționat substituenți. Nu executa deploy până când D1 cu jurisdicție UE, migrațiile, secretul și rate limiting sunt verificate.

## Verificare locală

`npm ci && npm test`. Suitele includ un flux autentic Better Auth pe SQLite în memorie: parolă, activare TOTP, noua autentificare cu al doilea factor și logout. Verificarea în browser și pe D1 remote rămâne necesară. Migrarea SQL a aplicației este testată separat cu `python3 ../docs/portal-v2/test_schema.py` într-un checkout al proiectului.

## Pașii următori

1. Testează autentificarea cu două conturi fictive și unul staff într-un mediu cu Wrangler funcțional; verifică izolarea și logarea cu 2FA.
2. Completează operațiile staff, crearea conturilor și schimbarea parolei inițiale. Interfața nouă este momentan o previzualizare în `portal-v2-frontend/`; pagina publică `portal/` nu a fost modificată.
3. Configurează adresa Workerului după alocare, testează fluxul browser pe mobil/Safari și execută exportul criptat plus restaurarea D1 înainte de date reale sau deploy public.
