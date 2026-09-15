# Vector Studio

Aplicație statică HTML/CSS/JavaScript pentru reconstrucția imaginilor raster (PNG/JPG/WebP) în SVG editabil, gândită în special pentru logo-uri, flyere și grafică flat.

## Ce face versiunea aceasta

- tracing raster → SVG cu **ImageTracerJS**;
- profil special „Logo / grafică flat” pentru margini mai ordonate și mai puține puncte;
- OCR opțional cu **Tesseract.js** pentru reconstruirea textului mic ca elemente SVG `<text>` editabile;
- „Geometry repair” opțional cu **OpenCV.js** pentru dreptunghiuri și cercuri clare;
- slider Original / Vector pentru verificarea marginilor;
- pan, zoom și Fit;
- layers pentru tracing, text OCR și forme geometrice;
- editarea culorii, opacității și a proprietăților textului;
- eliminarea automată a fragmentelor foarte mici;
- eliminarea opțională a unui fundal dominant;
- statistici pentru număr de paths, puncte, texte și forme;
- export SVG și copierea codului SVG.

## Important despre calitate

Aplicația prioritizează **forme curate** în locul urmăririi perfecte a fiecărui pixel. Rezultatele cele mai bune apar la:

- logo-uri;
- iconițe;
- text și grafică de marketing;
- forme geometrice;
- grafică flat cu puține culori;
- imagini sursă suficient de mari și clare.

Fotografiile complexe pot fi vectorizate, dar nu vor deveni automat ilustrații vectoriale simple.

## Publicare pe GitHub Pages

1. Creează un repository nou pe GitHub.
2. Încarcă **conținutul** acestui folder în rădăcina repository-ului (`index.html`, `assets/`, `.nojekyll`, etc.).
3. În GitHub: **Settings → Pages**.
4. La Source alege **Deploy from a branch**.
5. Alege branch-ul `main` și folderul `/ (root)`.
6. Salvează și așteaptă generarea adresei `https://NUME.github.io/REPOSITORY/`.

Nu este necesar Node.js, PHP sau un server backend.

## Dependențe externe

Aplicația încarcă în browser:

- ImageTracerJS 1.2.6 de pe jsDelivr;
- Tesseract.js v5 de pe jsDelivr (doar pentru OCR);
- OpenCV.js de la documentația oficială OpenCV (doar când „Geometry repair” este activ).

Imaginea selectată nu este încărcată de aplicație pe un server propriu. Bibliotecile și modelele OCR se descarcă însă de pe CDN la prima utilizare.

## Recomandare de lucru pentru logo-uri

Pornește cu:

- Profil: **Logo / grafică flat**
- Simplificare contur: **60–75**
- Netezire margini: **25–45**
- Eliminare fragmente: **15–30**
- Culori: **4–8** dacă logo-ul are puține culori

Dacă textul mare este un wordmark personalizat, setează pragul OCR suficient de mic încât textul mare să rămână tracing vectorial; OCR-ul este mai potrivit pentru subtitluri și texte mici.

## Limitări actuale

- identificarea exactă automată a fontului nu este inclusă încă;
- textul OCR este exportat ca `<text>`, nu ca outline-uri de font;
- Geometry repair este deliberat conservator și poate necesita ștergerea manuală a unei forme detectate greșit;
- sursele raster foarte mici nu conțin suficientă informație pentru reconstruirea perfectă a curbelor originale.
