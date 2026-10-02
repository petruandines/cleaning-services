# Portal clienți Petru & Inés

Public URL: https://petruandines.github.io/cleaning-services/portal/

The production portal uses the verified Cloudflare Worker and EU D1 schema 0009. Browser modules are copied from portal-v2-frontend with npm run build:portal. npm run test:portal runs the v2 frontend tests. Legacy Appwrite source/tests remain historical and are not the active build.

Do not place credentials here. Backup key/export token remain in GitHub Actions secrets for the weekly encrypted backup. Worker authentication secret is permanent.

Rollback: revert the production cutover commit. Previous production assets are preserved at main commit 3d32a03f81c6b7dbfe2a17aae873c72c2271f9dd. Do not delete Appwrite during rollback preparation.
