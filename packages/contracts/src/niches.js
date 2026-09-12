// ---------------------------------------------------------------------------
// The segment landing pages, as a registry.
//
// These pages are deliberately unlisted: nothing in the product links to them
// and search engines are asked not to index them (dorafi/admin's NicheLanding
// sets robots=noindex). They exist to be *sent* — one segment, one link, in
// outreach — not browsed by every customer who happens to scroll to a footer.
//
// Which means the links themselves need a home, and that home is the staff
// console (dorafi/staff's Niches tab). So the list lives here, in
// contracts, where both apps read it: dorafi/admin renders a page per entry,
// the staff console hands the team the link to send.
//
// Only the identity of a segment lives here — slug, URL, who it is for. The
// page copy (headline, demo conversation, pain points) is presentation and
// stays in dorafi/admin/src/content/niches.js, keyed by `view`.
// ---------------------------------------------------------------------------

/** Where the customer-facing app is served. Landing page URLs are built from
 *  this, so the staff console can show a link that is ready to paste. */
export const PUBLIC_APP_URL = 'https://dorafi.logafi.com';

export const NICHE_REGISTRY = [
  {
    view: 'osteopathes',
    path: '/solutions/osteopathes',
    label: 'Ostéopathes',
    audience: 'Ostéopathes et cliniques de thérapie manuelle',
    pitch: "Répond aux questions des patients pendant un traitement et les dirige vers la réservation en ligne.",
  },
  {
    view: 'physiotherapeutes',
    path: '/solutions/physiotherapeutes',
    label: 'Physiothérapeutes',
    audience: 'Cliniques de physiothérapie et de réadaptation',
    pitch: "Répond aux questions d'assurance (CNESST, SAAQ, référence médicale) et convertit les visiteurs en rendez-vous.",
  },
  {
    view: 'animaleries',
    path: '/solutions/animaleries',
    label: 'Animaleries',
    audience: 'Animaleries et boutiques pour animaux',
    pitch: 'Répond sur les marques, les formats, la livraison et la cueillette pendant que le personnel est sur le plancher.',
  },
];

/** The full link to send a prospect, ready to paste. */
export function nicheUrl(niche) {
  return `${PUBLIC_APP_URL}${niche.path}`;
}

/** Registry entry for a view key, or undefined. */
export function nicheByView(view) {
  return NICHE_REGISTRY.find((niche) => niche.view === view);
}
