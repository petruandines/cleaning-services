# Catalog PDF Viewer — GitHub Pages

Aplicație statică HTML/CSS/JavaScript pentru afișarea unui catalog PDF fără a modifica aspectul PDF-ului.

## Fișiere

- `index.html` — interfața
- `styles.css` — design responsive
- `app.js` — viewer, zoom, pan, căutare, miniaturi, URL per pagină, share, download
- `sw.js` — cache pentru aplicație / PDF.js după prima încărcare
- `catalog.pdf` — PDF-ul afișat
- `vendor/pdfjs/` — opțional: PDF.js local

## Publicare pe GitHub Pages

1. Pune toate fișierele din acest folder într-un repository GitHub.
2. Repository → **Settings → Pages**.
3. Alege `Deploy from a branch` și branch-ul dorit (`main`, folder `/root`).
4. Deschide URL-ul GitHub Pages.

Nu deschide `index.html` direct cu `file://`; PDF.js și service worker-ul trebuie testate prin HTTP/HTTPS. Pentru test local poți rula:

```bash
python -m http.server 8000
```

și apoi deschizi `http://localhost:8000`.

## Înlocuirea broșurii

Înlocuiește pur și simplu `catalog.pdf` cu alt PDF cu același nume. Numărul de pagini este detectat automat.

## URL unic pentru fiecare pagină

Exemplu:

```text
https://nume.github.io/catalog/?page=24
```

Viewerul deschide direct pagina 24. Next/Previous actualizează URL-ul, iar Back/Forward din browser funcționează.

## PDF.js local (opțional, recomandat)

Aplicația încearcă mai întâi:

```text
vendor/pdfjs/pdf.min.mjs
vendor/pdfjs/pdf.worker.min.mjs
```

Dacă nu le găsește, folosește automat CDN-ul. Pentru independență față de CDN, rulează `setup-pdfjs.ps1` pe Windows și apoi publică și folderul `vendor/pdfjs`.

## Comenzi

- rotiță mouse: zoom în punctul cursorului
- click + drag la zoom > 100%: pan în orice direcție
- pinch pe mobil/tabletă: zoom
- swipe stânga/dreapta la 100%: Next/Previous
- `←` / `→`: pagină precedentă / următoare
- `+` / `-`: zoom
- `0`: Fit Page / reset zoom
- `Ctrl+F` / `Cmd+F`: search
- `Esc`: închide panouri și revine la Fit Page

## Observații de performanță

Viewerul redă doar pagina curentă la rezoluție mare, preîncarcă doar vecinii și generează miniaturile lazy. Rezoluția canvas-ului este plafonată pentru a evita consumul exagerat de RAM/GPU pe telefoane sau dispozitive mai slabe.

## Preview profesional la distribuirea linkului

Aplicația include acum:

- titlu: `Catalog Servicii | Petru & Inés`
- descriere SEO / social media
- Open Graph pentru Facebook, WhatsApp, Messenger și LinkedIn
- Twitter Card / large image
- `social-preview.jpg` la 1200×630 px
- favicon 32×32
- Apple Touch Icon 180×180

În configurația livrată, imaginea Open Graph este setată la:

```text
https://petruandines.github.io/cleaning-services/catalog/social-preview.jpg
```

Dacă publici aplicația într-un alt folder sau pe alt domeniu, modifică în `index.html` doar URL-urile absolute din `og:image`, `og:image:secure_url` și `twitter:image`.

Nu este setat un `og:url` fix. Asta este intenționat, pentru ca linkurile de forma `?page=24` să rămână linkuri distincte atunci când distribui o anumită pagină a catalogului.

Dacă conectezi ulterior un domeniu propriu (de exemplu `petruandines.ro`), platformele sociale vor afișa domeniul propriu în loc de `github.io`; titlul, descrierea și imaginea de preview vor rămâne aceleași.


## Actualizare finală: afișare + text selectabil

- Zona de afișare rezervă automat spațiul real al barei de control numai când pagina ar intra sub toolbar. Astfel, grafica apropiată de marginea superioară rămâne vizibilă.
- Pe mobil se păstrează comportamentul compact: dacă pagina încape natural sub toolbar, nu sunt introduse margini suplimentare.
- Peste canvas există un PDF.js Text Layer complet transparent. El permite selectarea și copierea textului, fără să înlocuiască fonturile și fără să modifice aspectul PDF-ului.
- Căutarea evidențiază acum textul prin pozițiile generate de PDF.js Text Layer.
- Gesturile de pan/swipe nu pornesc atunci când utilizatorul începe selecția direct pe text; în zonele fără text funcționează ca înainte.
- A fost adăugat și un link semantic către `catalog.pdf` plus date structurate Schema.org, fără modificări vizuale ale catalogului.
