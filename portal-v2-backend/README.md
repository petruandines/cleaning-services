# Portal API — draft, nu este publicat

Interfața rămâne la `https://petruandines.github.io/cleaning-services/portal/`.
Acest Worker va primi cereri de pe acel origin. Codul nu conține credentiale; 
`BETTER_AUTH_SECRET` se setează ca Worker secret, niciodată în repository.

## Stare

- Schema aplicației: `../docs/portal-v2/0001_app_schema.sql`.
- API inițial: citire filtrată după sesiune, mesaj text de la client.
- Autentificarea folosește Better Auth și pluginul Bearer. Frontendul va ține tokenul **numai în memorie**: reîncărcarea paginii cere login nou.
- `disableSignUp` oprește înscrierea publică. Administratorul inițial, crearea utilizatorilor, migrarea tabelelor Better Auth, 2FA, backupul și testul end-to-end **nu sunt încă finalizate**.
- `wrangler.jsonc` conține intenționat substituenți. Nu executa deploy până când D1 cu jurisdicție UE, migrațiile, secretul și rate limiting sunt verificate.

## Verificare locală

`npm ci && npm test`. Migrarea SQL a aplicației este testată separat cu `python3 ../docs/portal-v2/test_schema.py` într-un checkout al proiectului.

## Pașii următori

1. Generează schema de autentificare din versiunea fixată Better Auth; păstreaz-o în migrații, apoi verifică rularea în D1 local.
2. Testează API-ul cu două conturi reale de test și unul staff în Wrangler local; verifică refuzul accesului între clienți și logarea cu 2FA.
3. Conectează interfața existentă la Worker fără a păstra tokenuri în storage și testează mobil/Safari.
4. Testează exportul criptat și restaurarea D1 înainte de date reale sau deploy public.
