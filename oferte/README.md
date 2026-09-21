# Pagina de oferte

Pagina publică este disponibilă la `/cleaning-services/oferte/`.

Pentru schimbarea campaniei se editează `offer.json`. Pagina solicită acest fișier cu `cache: no-store` și un parametru unic, astfel încât vizitatorii să primească versiunea actuală fără a li se șterge cache-ul browserului.

## Câmpuri importante

- `active`: `true` afișează oferta; `false` afișează mesajul „Pregătim următoarea ofertă”.
- `validUntil`: data și ora expirării în format ISO. După această dată oferta se închide automat.
- `validUntilLabel`: forma datei afișate vizitatorilor.
- `updatedAtLabel`: data ultimei actualizări afișată pe pagină.
- `image`: calea imaginii de campanie.
- `whatsappMessage`: mesajul pregătit în WhatsApp.
- `price`, `priceUnit` și `priceContext`: prețul principal și serviciul căruia i se aplică.
- `hourlyTitle`, `hourlyPrice` și `hourlyDescription`: varianta alternativă cu taxare la oră.
- `benefits`: lista avantajelor; sunt acceptate maximum șase.

Pentru o imagine nouă, fișierul poate fi adăugat în `oferte/assets/`, iar în `offer.json` se folosește calea `/cleaning-services/oferte/assets/nume-fisier.webp`.
