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
