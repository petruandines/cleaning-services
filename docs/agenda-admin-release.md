# Agenda privată Petru & Inés — lansare controlată

## Scop și izolare
- Frontend nou: /portal/agenda/ (HTML/CSS/ESM), din sesiunea admin existentă.
- Secțiunea clienților, autentificarea, parola, TOTP, conturile și rutele /portal/project/ și /portal/projects/ nu se rescriu.
- Agenda citește listele administrative /api/appointments și /api/one-time/admin, cu paginare.
- Intervențiile punctuale nu au ora de finalizare estimată; se afișează trei ore ORIENTATIVE și un avertisment.
- Lista intervențiilor punctuale are sortare SQL globală înainte de paginare și filtrare pe status.
- Agenda nu creează, nu anulează și nu mută intervențiile clientului.

## Backend și storage
Sursa de producție fixată: 45df05d8dc714d59f3e18af9fdd768f358756549.
Backendul actualizat pornește direct din acest commit, în feat/agenda-safe-backend-20261020.
Diferența este un handler administrativ nou /api/agenda/blocks, dispatchul lui și sortarea listei punctuale.

Blocajele sunt stocate numai în R2 privat, prin bindingul PROJECT_REPORTS, la cheia agenda-blocks/v1/index.json.
Nu necesită migrare D1, tabele suplimentare și nici editarea workflowului de backup D1.
Editarea concurentă este protejată prin ETag R2 și versionarea blocajelor.
Clientul obișnuit primește 403; doar sesiunea Better Auth admin cu TOTP activ are acces la API.
Nicio parolă, cheie sau token nu intră în exporturile calendarului.

ATENȚIE: Backupul criptat D1 NU include blocajele nou create în R2. Există export manual JSON în interfața agendei; arhiva trebuie păstrată privat. Recomandat înainte de utilizare intensivă: backup R2 separat, automat și criptat.

## Condiții obligatorii pentru orice publicare
1. Confirmă reușita ultimei copii D1 și o restaurare locală; descarcă o copie în afara GitHub.
2. Confirmă că bindingul PROJECT_REPORTS este privat, prezent și nealterat în Workerul publicat.
3. Rulează CI pe ambele branchuri: toate testele existente și noi, compilare statică, Worker dry-run.
4. Verifică interfața și APIul cu date fictive și cont administrativ de test, într-un mediu izolat.
5. Publică APIul numai după auditul diffului și actualizarea atentă a pinului exact al Workerului din workflowul de producție.
6. Testează pe dispozitivul Android, prin HopWeb, deschiderea Waze, apelul, WhatsApp și persistența sesiunii.
7. Nu combina în main doar frontendul: APIul vechi nu are /api/agenda/blocks.
8. După publicare verifică loginul clientului recurent, accesul la proiectele punctuale și backupul. La orice eroare, folosește commitul pinuit anterior și ultima versiune Pages validă.
9. Dacă nu poți verifica backupul sau accesul clienților, NU publica.

## Funcții și limite
- Lună, săptămână, zi, listă; sortare/filtrare intervenții punctuale.
- Detalii și Waze/Hărți/apel/WhatsApp doar când sunt disponibile datele.
- Blocaje simple, all-day, multi-day, recurente zilnice/săptămânale/lunare, eliminarea sau editarea unei apariții.
- Export ICS pe maximum 366 zile. Detaliile personale sunt excluse implicit.
- ICS este un snapshot; recurențele se expandează pe intervalul exportat, fără sincronizare automată.
- APK nu se poate crea din aceste fișiere web singure; proiectul HopWeb trebuie compilat separat, după teste de WebView Android.
