// CONFIGURARE SIMPLĂ
// Nu trebuie să scrii numele celor 28 de fișiere.
// Pune paginile în /pages/ și numește-le 01.jpg, 02.jpg ... 28.jpg.

const CATALOG_CONFIG = {
  title: "Catalog Servicii ",
  subtitle: "Consultă catalogul pentru a vedea serviciile pe care ți le putem oferi.",

  // Calea și formatul paginilor.
  pageFolder: "pages/",
  pagePrefix: "",
  pageExtension: ".jpg",

  // Numărul de pagini. Pentru catalogul tău: 28.
  pageCount: 28,

  coverPage: 1,
  initialPage: 1,

  showCover: true,
  thumbnails: true,
  zoom: true,
  fullscreen: true
};

// Link-uri partajabile:
// https://siteul-tau.github.io/catalog/?page=5
// Dacă URL-ul conține ?page=N, aplicația deschide direct pagina N.
