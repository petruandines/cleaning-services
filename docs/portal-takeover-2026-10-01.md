# Portal takeover checkpoint — 2026-10-01

- Independent encrypted backup run 36885137806 succeeded, local restore test succeeded; owner confirmed ZIP saved and key separate.
- D1 contract migration run 36891132061 used apply, passed 63 tests, applied and verified schema 0007. Do not repeat migration.
- Worker inspect 36895194983 passed; deploy 36895508195 passed 63 tests, verified login and denial of anonymous API.
- Preview frontend contract files activated on main commit cba5d059760ddf8ec9be858b3e7b1a1f13ad9adc; copied reviewed app.js, index.html, portal.css, contract-view.mjs from draft. 10 frontend tests and module syntax check passed.
- /portal/ public remains Appwrite; only /portal-v2-frontend/ updated. Await owner phone QA: staff Clients -> Contract, optional fields save, customer tab only with populated fields.
- Temporary credentials cleanup remains outstanding: Cloudflare portal-contract-worker-temporary, portal-contract-migrate-temporary, portal-contract-backup-temporary and prior Portal contract inspect; GitHub PORTAL_WORKER_CONTRACT_TOKEN, PORTAL_D1_CONTRACT_TOKEN, PORTAL_BACKUP_D1_EXPORT_TOKEN, PORTAL_BACKUP_KEY_HEX (owner has offline key). Check any leftover PORTAL_BACKUP_D1_READ_TOKEN. Preserve PORTAL_WORKER_AUTH_SECRET.
- Remaining requested features include appointment Draft status and payments spanning selected locations; inspect latest draft implementation before changing. Do not repeat confirmed ICS/Excel export or prior independent remote restore test.

## Draft implementation prepared
Owner confirmed contract saving works. Prepared 0008 appointment Draft migration, API create/edit, violet badge and tentative ICS. Draft is visible to its own client as provisional, excluded from upcoming intervention banner. Migration preserves rows/IDs and uses a foreign-key guard before ending deferral. Tests: 66 backend + 11 frontend; local D1 populated migration and Worker compile checked. Not migrated or deployed remotely. Next: inspect with existing PORTAL_D1_CONTRACT_TOKEN, fresh backup accounting for schema 0007 and contract data, then explicit apply and Worker deployment, then preview. Old pinned workflows must not be reused for new schema.

- Draft inspect run 36921915275 succeeded on 2026-10-01: 66 tests, operation inspect, blank confirmations, schema 0007; migration 0008 not applied. Bookmark 0000004d-00000000-000050f7-7087c36eacc2c49f8e60d78b8615b17b. Updated backup script to validate schema 0007 via draft upgrader (eight pinned files, 0008 pending). Next run encrypted export with existing export token and saved key, download archive before apply. No source DB change.

## Draft activation — 2026-10-02
- Backup 36922414968 succeeded; owner confirmed ZIP saved separately before migration.
- Migration apply 36922976322 succeeded, schema 0008 verified, related record counts/payment total and foreign key check passed. Pre-migration bookmark: 0000004f-00000000-000050f7-fcce5dc901b60decf63d625cf1fde50c. Do not repeat apply.
- Worker inspect 36923226204 and deploy 36923518120 succeeded, 66 tests, login available and anonymous API denied. Verified after credit interruption.
- Preview activation commit eadbf76dc21e3888afe353927aadf0f0dc416d3d copies four reviewed frontend files from 149526e84c34ceed170393980bc65458043abc0b. Public /portal/ remains unchanged. Await phone QA: create Draft, reload, edit to Confirmată. Existing 11 frontend tests passed before publication; no repeat required without regression.
- Next implementation: one payment for selected multiple locations, without duplicate sums; backup periodic workflow, full client QA, cutover remain. Temporary access cleanup still pending. Backup workflow is currently pinned to schema 0007; must update before next export on schema 0008.


## 2026-10-02 — Payments across selected locations prepared

Owner confirmed Draft appointments work. Next requirement implemented on the draft branch, not yet activated:
- Migration 0009 adds payment_locations ownership-scoped composite foreign keys, backfills existing payment/appointment links including archived history. Existing financial rows remain unchanged.
- One payment/total for selected locations; POST supports location_ids as an alternative to existing appointment/job references. Legacy API compatibility retained.
- Staff can edit selected locations; archived linked locations stay visible and may be retained. No new link to another client's or archived location is permitted.
- API enriches one paginated payment row with all locations; existing cards and Excel show the combined labels without duplicating amounts.
- Staff UI checkboxes with select/deselect all, required nonempty selection for new payments. Legacy payments with no location can still be edited without assigning one. Maximum 100 selected locations per payment, parameter chunking for D1 limits.
- Atomic payment/job/link/audit changes and rollback tested. 70 backend, 12 frontend and 5 backup tests passed; Worker dry-run passed.
- Manual payment-location migration and Worker workflows pinned to the reviewed commit use existing temporary CONTRACT tokens; permanent PORTAL_WORKER_AUTH_SECRET is preserved.
- Backup workflow updated to verify schema 0008 with pending 0009 before export. Need NEW encrypted backup downloaded/offline key saved before apply; previous Draft backup was schema 0007.
Next: migration inspect, fresh schema-0008 backup export + owner confirms ZIP saved, migration apply, Worker inspect/deploy, then publish reviewed frontend files and verify phone behavior. No remote database writes or Worker deployment were performed for this feature during preparation.


### Payment-location migration inspection — verified
- Run https://github.com/petruandines/cleaning-services/actions/runs/36981035219, job 110755368686: success; checked reviewed commit 064bd76ac79bb1e3beae8702795a6c9190829cd3.
- 70/70 backend tests passed. OPERATION=inspect; both confirmation fields empty. Exact EU D1 is at schema 0008; nine SQL files pinned with 0009 pending. No migration or database write performed.
- Time Travel bookmark: 00000053-00000000-000050f8-219d2c6643ae90eece5ece364f6cb099.
- Next owner action: NEW schema-0008 encrypted backup export through the refreshed main backup workflow; same saved key and existing temporary export token. Verify download/offline storage before apply 0009.


### Schema-0008 backup attempt 36981356128
- Failed after target/schema verification; backend 70 and backup 5 tests passed. No artifact uploaded and no source D1 writes. Exact failure stage was hidden by the generic wrapper; root cause not yet established.
- Add safe stage-level progress and whitelisted diagnostic categories for export/encryption, archive authentication and isolated local recovery. No SQL, keys, paths or signed URLs are displayed.
- Backup workflow must use the new reviewed diagnostic commit. Owner should start a NEW export, not re-run the failed old-code job. Migration 0009 remains pending.


### Schema-0008 backup recovery correction
- Run 36981803101 (job 110757774333) failed specifically at isolated local D1 recovery. Export/encryption and encrypted archive authentication succeeded. No artifact uploaded; source D1 unchanged.
- Reproduced the populated schema-0008 restore failure with fictional client/location/appointment/job/payment data. Migration 0008 rebuild places appointments later in sqlite_schema/export order; jobs data can be imported before its referenced table exists.
- Recovery now prepares a private SQL copy with all CREATE TABLE declarations before original data/index statements. Original encrypted archive is unchanged. SQL statement parsing respects quoted semicolons; D1 deferred FK behavior and final integrity/foreign-key checks retained.
- All 7 backup tests passed, including real local Wrangler export/restore for populated schema 0008 and matching financial records. Existing backend 71 tests passed before this Python-only fix.
- Next: owner starts NEW export in refreshed main backup workflow; no key/token changes. Review result and download ZIP before apply 0009. Remote recovery workflows must use the same table-order preparation when upgraded beyond schema 0006.


### Schema-0008 backup successful — owner download pending
- Run https://github.com/petruandines/cleaning-services/actions/runs/36982567244, job 110760173955: success. Backend 71/71 and backup 7/7 tests passed; all three real backup stages succeeded including isolated local D1 restore.
- Exact EU source confirmed schema 0008; migration 0009 not applied and source unmodified.
- Encrypted file SHA-256: 90ba1e984aab6dd17383f72ee6edde1cee13b4412dbfbdf95734e5fa1b8f7dbe.
- Artifact portal-d1-encrypted-36982567244, ID 11215901909, size 51406 bytes; expires 2026-10-03 08:11:24Z (10:11 Europe/Madrid).
- Next: owner downloads ZIP and stores privately outside GitHub/Cloudflare, offline key separate; await ZIP saved confirmation before apply 0009. Workflow remains pinned to reviewed code 064bd76ac79bb1e3beae8702795a6c9190829cd3 for migration/Worker, and 6f9dd9eea4a82afa651a2c76cc73dbadb7d13ee0 for backup.


### Owner confirmed ZIP saved
- 2026-10-02: owner explicitly confirmed ZIP saved for successful backup run 36982567244 following download/private-copy and separate-key instructions.
- Proceed with manual migration 0009 apply using pinned workflow portal-d1-payment-locations-upgrade.yml; exact APPLY PORTAL PAYMENT LOCATIONS UUID and TIME TRAVEL VERIFIED UUID confirmations. Verify resulting run before Worker update; do not publish frontend ahead of backend.


### Migration 0009 applied successfully
- Run https://github.com/petruandines/cleaning-services/actions/runs/36982933465, job 110761360162: success. Backend 70/70 passed at reviewed 064bd76 code; OPERATION=apply and exact confirmation/recovery strings verified.
- Pre-migration recovery bookmark: 00000057-00000000-000050f8-b777e70bd330bdf6911f8d39a34893b6.
- Script finished schema-0009 verification, backfill completeness, foreign-key checks and unchanged appointment/job/payment counts and payment total.
- Worker and frontend have NOT been updated for payment-location selection yet. Next owner action: Portal Worker payment locations update workflow, main, inspect, empty confirmation. Review before deploy, then publish reviewed frontend.


### Worker pre-deployment inspection passed
- Run https://github.com/petruandines/cleaning-services/actions/runs/36983161938, job 110762090535: success. Backend 70/70 and Worker dry-run passed; schema 0009, all nine migration hashes and existing Worker target verified.
- OPERATION=inspect, confirmation empty. No Worker deployment occurred.
- Next owner action: NEW run in portal-worker-payment-locations-update.yml, main, deploy; confirmation UPDATE PORTAL PAYMENT LOCATIONS 6816004b-dc95-48c9-be52-9bd4131d157e. Review success and anonymous API/auth checks before publishing frontend app.js/portal.css from reviewed feature code.


### Multi-location payments activated in preview
- Worker deploy run https://github.com/petruandines/cleaning-services/actions/runs/36983375829, job 110762783953: success. OPERATION=deploy with exact confirmation; schema 0009 and nine pinned files checked, 70/70 backend tests passed, login visible and anonymous API denied.
- Main preview publication commit 8a268f91a37cbcb452bdc08fb0b64686e43303a0: app.js and portal.css from reviewed feature commit 064bd76; index.html asset cache version changed to 20261002-payment-locations.
- Pages run 36983581313, job 110763431212: deployment success. All 12 frontend tests passed; publicly served app.js and portal.css byte-match tested files.
- Await owner phone check: admin selects client, Payments allows one/several/all locations, single total; edits and Excel retain one row/payment. Old public Appwrite /portal/ remains unchanged.
- Next after owner check: update backup schema guard and recovery table counts for schema 0009, then remaining QA/cutover plan and temporary access cleanup. Existing backup workflow deliberately verifies schema 0008 and will refuse schema 0009 until updated.


### Schema-0009 backup and weekly automation prepared
- Owner confirmed multi-location payments work on phone and authorized next phase.
- Backup script now requires schema 0009 (all nine pinned migrations). Encrypted archive recovery includes payment_locations and compares counts for every expected table. Counts can safely inspect legacy 16-table or current 17-table archives; unknown tables rejected.
- Schema-first recovery now also creates unique indexes before dependent row inserts, required for the composite payment/location foreign keys in migration 0009. Original encrypted SQL/archive remains unchanged.
- Local fixture exported/restored through real Wrangler at schema 0009, matching payment sums and one migrated payment_locations link; all 7 backup tests and 71 backend tests passed. Workflow YAML/summary/30-day retention validated.
- Main weekly workflow: Sunday 02:00 UTC, also manually dispatchable for proof; reviewed code fixed by SHA, temporary export token and saved key reused. 30-day encrypted artifacts; owner still must download a separate private copy. No email/chat messages sent. Confirm actual schedule execution later; GitHub can delay cron jobs.
- Preserve PORTAL_BACKUP_D1_EXPORT_TOKEN and PORTAL_BACKUP_KEY_HEX while weekly backups are active; retire migration/Worker temporary tokens after final QA. Preserve PORTAL_WORKER_AUTH_SECRET.
- Next owner action: manual run of Portal D1 weekly encrypted backup on main; verify schema9 artifact, download/save, then follow docs/portal-v2/final-phone-checks.md with two client accounts. Inventory Appwrite real data before cutover; public /portal/ remains old backend.


### Weekly backup first manual proof succeeded
- Run https://github.com/petruandines/cleaning-services/actions/runs/36984798940, job 110767255974: success. Backend 71/71 and backup 7/7 tests passed; real schema0009 export/encryption, authentication, isolated local restore and result summary completed. Source database unmodified.
- Encrypted file SHA256 0d1985f97286c1b47b359f5d4b023e7db5f667854107bf0da886ce8397e47284.
- Artifact portal-d1-encrypted-36984798940, ID11216619721, 52851 bytes, expiry 2026-11-01T09:35:17Z; owner download/private copy pending.
- Scheduled Sunday02:00UTC is configured; manual run demonstrates same pipeline, not actual cron execution. Confirm first scheduled run after 2026-10-04. Keep export token/key while active; no migration/Worker temporary cleanup yet confirmed.
- Next: owner ZIP saved confirmation, then first-client phone check. Inventory actual Appwrite data and second-client isolation before controlled cutover.


### Owner saved schema-0009 backup
- 2026-10-02 owner confirmed ZIP saved for weekly backup manual proof 36984798940 after private-copy/separate-key instructions.
- Next client phone QA: existing client login, own locations/appointments/payments only, conditional Contract tab, single-total multi-location payment, client->admin chat and logout. Then second-client isolation and Appwrite data inventory before cutover. No public portal cutover authorized/performed in this checkpoint.


### First-client phone QA confirmed
- 2026-10-02 owner confirmed all instructed client checks work: login as client, own locations/appointments/payments, populated-only Contract fields/tab, single-total multi-location payment and sending a message to admin.
- Await second-client isolation/logout check; do not assume an existing second test account. Confirm old Appwrite contains real records needing transfer versus tests/empty before deciding cutover.
- Current new portal features, schema9 backup and manual weekly pipeline proof verified; old public /portal/ remains Appwrite.


### Canonical portal launched 2026-10-02
- Owner confirmed second-client isolation works and old Appwrite contains only test data. No data migration required; no Appwrite records deleted.
- Main production cutover commit 177d1665a114a64879b313af2e65fe311bb6e5a1 copies nine tested v2 frontend assets to /portal/ and updates asset cache version. Public URL remains https://petruandines.github.io/cleaning-services/portal/ . Existing D1 records/accounts retained.
- npm run build:portal now copies v2 assets using scripts/build-portal-v2.mjs; npm run test:portal targets v2 tests instead of inactive legacy Appwrite tests. Legacy source remains in git; no backend deployment needed for route change (same origin).
- 12 frontend tests passed. Pages run 36988259945 succeeded. Pre-cutover main reference 3d32a03f81c6b7dbfe2a17aae873c72c2271f9dd; revert production cutover commit to restore old Appwrite public assets if necessary.
- Next: canonical-route login confirmation on phone, then revoke only temporary migration/Worker tokens and delete corresponding GitHub secrets. Keep permanent Worker auth secret and backup export token/key for weekly workflow. Do not delete Appwrite during launch verification. First actual weekly cron run remains to be checked after 2026-10-04.

- Post-cutover HTTP verification: all nine /portal/ assets match prepared files byte-for-byte. Browser-origin probe: /login HTTP200 and anonymous /api/me HTTP401, Access-Control-Allow-Origin https://petruandines.github.io. Canonical phone login confirmation remains next.


### Canonical admin login confirmed
- 2026-10-02 owner logged in as admin at public /portal/ and confirmed it works perfectly.
- Remaining owner cleanup: revoke only Cloudflare migration/inspect/Worker deployment tokens associated with PORTAL_D1_CONTRACT_TOKEN and PORTAL_WORKER_CONTRACT_TOKEN, then delete those exact GitHub secrets. PORTAL_BACKUP_D1_READ_TOKEN is not used by the weekly export (optional later cleanup when identity clear).
- Preserve PORTAL_WORKER_AUTH_SECRET, PORTAL_BACKUP_D1_EXPORT_TOKEN and PORTAL_BACKUP_KEY_HEX. Weekly exports depend on export token and key; preserve the corresponding Cloudflare backup export token. Owner must match token names/permissions before revocation; cannot inspect secrets via GitHub connector.
- Public launch functional; no Appwrite deletion required. Scheduled weekly run still must be verified after Sunday 2026-10-04; manual pipeline proof succeeded.

## 2026-10-02 11:51 UTC — backup credentials and cleanup completed

- Owner created new Cloudflare token portal-backup-weekly with Account D1 Edit limited to their account; instructed to leave TTL empty. Actual final TTL not independently inspected.
- Owner updated PORTAL_BACKUP_D1_EXPORT_TOKEN and ran weekly workflow manually: https://github.com/petruandines/cleaning-services/actions/runs/37002494535 . Job 110823151459 success; 71 backend tests and 7 backup tests passed. Exact EU database schema 0009 verified; encrypted export authenticated and restored into isolated local D1; no database writes.
- Artifact portal-d1-encrypted-37002494535, ID 11224595495, 58592 bytes; expires 2026-11-01T11:43:31Z. Encrypted file SHA-256 c27a66ad1151d580890b763627fd500a8f197cd784abe9792e56c02d293f2044.
- Owner confirmed completion of instructed cleanup and archive saving: revoke portal-contract-worker-temporary, portal-contract-migrate-temporary, Portal contract inspect, and replaced Token2; delete PORTAL_D1_CONTRACT_TOKEN, PORTAL_WORKER_CONTRACT_TOKEN, and leftover PORTAL_BACKUP_D1_READ_TOKEN if present. This is owner-reported, not independently enumerated.
- Preserve portal-backup-weekly Cloudflare token and GitHub PORTAL_BACKUP_D1_EXPORT_TOKEN, PORTAL_BACKUP_KEY_HEX, PORTAL_WORKER_AUTH_SECRET; offline archive and key kept separately.
- Public portal functional and owner-tested. First actual scheduled weekly run remains unobserved; due Sunday 2026-10-04 02:00 UTC (04:00 Europe/Madrid and 05:00 Europe/Bucharest). No automatic monitoring claimed.

## 2026-10-02 — admin menu preview completed

- Implemented owner-requested admin groups with dedicated lists, ICS/XLSX export, add forms, contracts and selected-client access. Sticky selected-client controls include a menu jump link for long histories. Native details/summary supports expandable mobile groups and active submenu. Client UI remains unchanged.
- Edit opens a dedicated form and synchronizes selected-client context; cancel/save return to list. Guards reject stale list responses and mutation completions after client/navigation changes.
- All 17 frontend tests passed, including five navigation integration tests and existing export/payment/location/session tests; syntax valid. Browser visual verification unavailable locally (Chromium download failed); owner phone review pending.
- Preview publication main commit f9d4b36c2de47ab2bee7e34f7860a744d8fc8984. First Pages deployment 37065143093 passed; final correction deployment pending verification. Canonical /portal/ deliberately unchanged until owner accepts preview.
- No backend, database, token or backup changes required.

## 2026-10-02 21:14 UTC — owner-approved admin menus live

- Owner confirmed preview is OK and explicitly requested canonical portal update.
- Copied all nine reviewed frontend assets into /portal/ at main commit 75717f2e79564b53d8ca63840e62bdc2fb3f9a93; versioned canonical entry points as portal-v2-20261002-admin-menu and updated scripts/build-portal-v2.mjs to preserve the cache version on future builds.
- GitHub Pages deployment 37065706852 / job 111032868577 completed successfully. Live HTTP reads verified all nine canonical assets equal approved preview (index query version normalized). Previously passed 17 frontend tests; owner accepted phone preview.
- Canonical URL: https://petruandines.github.io/cleaning-services/portal/ . No database, Worker or credential modifications.
