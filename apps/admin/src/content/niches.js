import { NICHE_REGISTRY } from '@b2b-ai-chatbot/contracts';
import {
  PhoneMissed,
  MessageCircleQuestion,
  CalendarCheck,
  ShieldCheck,
  Baby,
  Activity,
  PawPrint,
  PackageSearch,
  Truck,
  Accessibility,
  FileText,
  Clock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Niche landing pages, as content rather than code.
//
// Each entry below is the *copy* for one page; its identity (slug, URL,
// label) comes from NICHE_REGISTRY in @b2b-ai-chatbot/contracts, which the
// staff console reads too — so the team hands out the same link the app
// serves. They all render through components/NicheLanding.jsx and their
// routes come from the registry, so adding a segment is one registry entry
// plus one copy block: no new component, no new route, no new test.
//
// These pages are unlisted on purpose: nothing in the product links to them
// and they ask not to be indexed. The link is the door.
//
// Written in French: these target Québec small businesses, which is also why
// the demo exchanges below read the way a real customer would ask.
//
// The demo conversation is a scripted preview, not a live widget call, so
// these pages ship stable and testable without depending on a real demo
// tenant existing. Content is grounded in how businesses in each segment
// present themselves publicly, genericized — no real business's name,
// photo, or identity appears on a public page.
// ─────────────────────────────────────────────────────────────────────────

const CONTENT = [
  {
    view: 'osteopathes',
    seoTitle: 'Assistant IA pour ostéopathes et cliniques manuelles',
    seoDescription:
      "Un assistant IA entraîné sur le contenu réel de votre site répond aux questions de vos patients 24/7, capture leurs coordonnées et les dirige vers votre réservation en ligne. Pensé pour les ostéopathes et cliniques de thérapie manuelle.",
    badge: { icon: Activity, text: 'Pensé pour les ostéopathes & cliniques manuelles' },
    hero: {
      titleLead: 'Un assistant qui répond à vos patients,',
      titleAccent: 'même quand vous avez les mains prises',
      subtitle:
        "Collez l'adresse de votre site : votre assistant apprend vos services, vos tarifs et votre FAQ, répond à vos visiteurs 24/7 et capture leurs coordonnées pendant que vous traitez vos patients.",
      primaryCta: 'Essayer avec le site de ma clinique',
      reassurance: 'Essai gratuit sans carte de crédit. Prêt en moins d’une minute.',
    },
    demo: {
      assistantLabel: 'Assistant de votre clinique',
      exchange: [
        {
          q: 'Est-ce que la première consultation est différente des suivantes?',
          a: "Oui — la première visite inclut une évaluation complète de votre posture, votre mobilité et votre historique de santé, en plus du traitement. Prévoyez environ 60 minutes. Aucun vêtement spécial n'est requis, une tenue confortable suffit.",
        },
        {
          q: 'Traitez-vous les femmes enceintes et les bébés?',
          a: "Oui, l'ostéopathie douce est adaptée aux douleurs liées à la grossesse, au suivi post-partum ainsi qu'aux tensions chez le nourrisson. N'hésitez pas à mentionner votre situation en réservant.",
        },
        {
          q: 'Avez-vous de la disponibilité cette semaine?',
          a: "Je vérifie ça pour vous — voici le lien de réservation en ligne de la clinique, vous y verrez les créneaux disponibles en temps réel : [Réserver un rendez-vous].",
        },
      ],
    },
    painPointsTitle: 'Ce que ça coûte de ne pas répondre à temps',
    painPoints: [
      {
        icon: PhoneMissed,
        iconClass: 'text-red-600',
        title: 'Impossible de répondre pendant un traitement',
        text: "Vous avez les mains sur un patient — l'appel ou le message d'un nouveau client tombe, et il réserve ailleurs pendant que vous êtes occupé·e.",
      },
      {
        icon: MessageCircleQuestion,
        iconClass: 'text-amber-600',
        title: 'Toujours les mêmes questions',
        text: "Est-ce couvert par les assurances? Que porter? Traitez-vous les enfants ou les femmes enceintes? Vous répondez au même message dix fois par semaine.",
      },
      {
        icon: CalendarCheck,
        iconClass: 'text-emerald-600',
        title: 'Des rendez-vous perdus le soir et la fin de semaine',
        text: "La majorité des visiteurs de votre site arrivent en dehors de vos heures d'ouverture, quand personne ne peut leur répondre.",
      },
    ],
    steps: [
      {
        title: "Collez l'adresse de votre site",
        text: "Aucune installation technique. On lit automatiquement les pages de votre site (services, tarifs, FAQ, à propos).",
      },
      {
        title: 'Votre assistant est prêt en quelques secondes',
        text: "Il répond aux questions de vos patients avec le contenu réel de votre clinique — pas des réponses génériques.",
      },
      {
        title: 'Un seul lien à coller sur votre site',
        text: "Une ligne de code, fournie automatiquement. Ajoutez votre lien de réservation existant (Calendly, Cal.com, GoRendezvous…) et l'assistant peut y diriger vos patients directement.",
      },
    ],
    trust: [
      {
        icon: ShieldCheck,
        iconClass: 'text-brand-700',
        title: 'Vos données, isolées',
        text: "Le contenu de votre site et les échanges avec vos patients restent strictement séparés de tout autre client.",
      },
      {
        icon: CalendarCheck,
        iconClass: 'text-emerald-600',
        title: 'Réservation en un clic',
        text: "Ajoutez votre lien Calendly, Cal.com ou GoRendezvous — l'assistant y dirige directement les patients prêts à prendre rendez-vous.",
      },
      {
        icon: Baby,
        iconClass: 'text-sky-600',
        title: 'Bilingue, sans configuration',
        text: 'Répond aussi bien en français qu’en anglais à partir du même contenu, pour les clientèles mixtes.',
      },
    ],
    closing: {
      title: 'Voyez ce que ça donne avec le site de votre clinique',
      text: 'Aucune carte de crédit requise pour essayer. Ça prend moins d’une minute.',
    },
  },

  {
    view: 'physiotherapeutes',
    seoTitle: 'Assistant IA pour physiothérapeutes et cliniques de réadaptation',
    seoDescription:
      "Un assistant IA entraîné sur le contenu réel de votre site répond aux questions de vos patients 24/7 — assurances, CNESST, SAAQ, référence médicale — et les dirige vers votre réservation en ligne. Pensé pour les cliniques de physiothérapie.",
    badge: { icon: Accessibility, text: 'Pensé pour les cliniques de physiothérapie' },
    hero: {
      titleLead: 'Vos patients ont des questions avant de réserver,',
      titleAccent: 'votre assistant y répond à votre place',
      subtitle:
        "Collez l'adresse de votre site : votre assistant apprend vos services, vos tarifs et vos conditions de remboursement, puis répond aux visiteurs 24/7 et capture leurs coordonnées pendant que votre équipe est en traitement.",
      primaryCta: 'Essayer avec le site de ma clinique',
      reassurance: 'Essai gratuit sans carte de crédit. Prêt en moins d’une minute.',
    },
    demo: {
      assistantLabel: 'Assistant de votre clinique',
      exchange: [
        {
          q: "Est-ce que j'ai besoin d'une référence de mon médecin?",
          a: "Non, la physiothérapie est accessible directement au Québec — aucune référence n'est nécessaire pour prendre rendez-vous. Certains assureurs privés peuvent toutefois l'exiger pour le remboursement, ça vaut la peine de vérifier votre contrat.",
        },
        {
          q: 'Acceptez-vous la CNESST et la SAAQ?',
          a: "Oui, les dossiers CNESST et SAAQ sont pris en charge. Apportez votre numéro de réclamation à la première visite; la facturation se fait alors directement auprès de l'organisme.",
        },
        {
          q: 'Combien de temps dure une séance?',
          a: "L'évaluation initiale dure environ 60 minutes et les séances de suivi de 30 à 45 minutes. Voici le lien pour choisir votre plage horaire : [Réserver un rendez-vous].",
        },
      ],
    },
    painPointsTitle: 'Ce que ça coûte de ne pas répondre à temps',
    painPoints: [
      {
        icon: FileText,
        iconClass: 'text-amber-600',
        title: 'Les mêmes questions d’assurance, tous les jours',
        text: "CNESST, SAAQ, assurance privée, reçu pour impôts, référence médicale — votre réceptionniste répète les mêmes réponses au lieu de gérer la clinique.",
      },
      {
        icon: PhoneMissed,
        iconClass: 'text-red-600',
        title: 'Personne au téléphone pendant les traitements',
        text: "Un nouveau patient qui n'obtient pas de réponse aujourd'hui appelle la clinique d'à côté demain.",
      },
      {
        icon: CalendarCheck,
        iconClass: 'text-emerald-600',
        title: 'Des plages horaires qui restent vides',
        text: "Les visiteurs arrivent sur votre site le soir et la fin de semaine, exactement quand il n'y a personne pour les convertir en rendez-vous.",
      },
    ],
    steps: [
      {
        title: "Collez l'adresse de votre site",
        text: "Aucune installation technique. On lit vos pages — services, tarifs, conditions de remboursement, équipe.",
      },
      {
        title: 'Votre assistant est prêt en quelques secondes',
        text: "Il répond avec le contenu réel de votre clinique, y compris vos conditions d'assurance — pas des généralités trouvées ailleurs.",
      },
      {
        title: 'Un seul lien à coller sur votre site',
        text: "Une ligne de code, fournie automatiquement. Ajoutez votre lien de réservation existant et l'assistant y dirige les patients prêts à réserver.",
      },
    ],
    trust: [
      {
        icon: ShieldCheck,
        iconClass: 'text-brand-700',
        title: 'Vos données, isolées',
        text: "Le contenu de votre site et les échanges avec vos patients restent strictement séparés de tout autre client.",
      },
      {
        icon: FileText,
        iconClass: 'text-emerald-600',
        title: 'Répond à partir de vos conditions',
        text: "Vos modalités de remboursement et vos politiques d'annulation viennent de vos propres pages : l'assistant n'invente rien.",
      },
      {
        icon: Accessibility,
        iconClass: 'text-sky-600',
        title: 'Bilingue, sans configuration',
        text: 'Répond aussi bien en français qu’en anglais à partir du même contenu, pour les clientèles mixtes.',
      },
    ],
    closing: {
      title: 'Voyez ce que ça donne avec le site de votre clinique',
      text: 'Aucune carte de crédit requise pour essayer. Ça prend moins d’une minute.',
    },
  },

  {
    view: 'animaleries',
    seoTitle: 'Assistant IA pour animaleries et boutiques pour animaux',
    seoDescription:
      "Un assistant IA entraîné sur le contenu réel de votre site répond aux questions de vos clients 24/7 — disponibilité, marques de nourriture, formats, livraison et cueillette — et les dirige vers le bon produit. Pensé pour les animaleries.",
    badge: { icon: PawPrint, text: 'Pensé pour les animaleries & boutiques pour animaux' },
    hero: {
      titleLead: 'Vos clients demandent si vous avez le bon produit,',
      titleAccent: 'votre assistant leur répond tout de suite',
      subtitle:
        "Collez l'adresse de votre site : votre assistant apprend vos marques, vos formats, vos prix et vos modalités de livraison, puis répond à vos visiteurs 24/7 — au lieu de les laisser aller vérifier ailleurs.",
      primaryCta: 'Essayer avec le site de ma boutique',
      reassurance: 'Essai gratuit sans carte de crédit. Prêt en moins d’une minute.',
    },
    demo: {
      assistantLabel: 'Assistant de votre boutique',
      exchange: [
        {
          q: 'Est-ce que vous tenez de la nourriture sans grains pour chat?',
          a: "Oui, plusieurs gammes sans grains sont offertes en boutique, en formats de 2 kg à 7 kg. Si votre chat a une sensibilité particulière, dites-moi laquelle et je vous oriente vers la bonne formule.",
        },
        {
          q: 'Livrez-vous à domicile ou faut-il passer en magasin?',
          a: "Les deux sont possibles : la cueillette en magasin est prête le jour même, et la livraison locale est offerte pour les commandes admissibles. Vous trouverez les détails et le seuil de livraison gratuite ici : [Livraison et cueillette].",
        },
        {
          q: 'Quelle taille de harnais pour un chiot de 6 mois?',
          a: "Ça dépend surtout du tour de poitrine plutôt que de l'âge. Mesurez-le et je vous indique la taille correspondante — nos guides de tailles sont aussi affichés sur chaque fiche produit.",
        },
      ],
    },
    painPointsTitle: 'Ce que ça coûte de ne pas répondre à temps',
    painPoints: [
      {
        icon: PackageSearch,
        iconClass: 'text-amber-600',
        title: '« Est-ce que vous avez ça en stock? »',
        text: "La question revient sans arrêt, par téléphone, par courriel et par message. Sans réponse rapide, le client commande en ligne ailleurs.",
      },
      {
        icon: Clock,
        iconClass: 'text-red-600',
        title: 'Le plancher passe avant le téléphone',
        text: "Vous servez un client au comptoir pendant que trois messages attendent — et la vente la plus facile est celle à laquelle on répond en premier.",
      },
      {
        icon: Truck,
        iconClass: 'text-emerald-600',
        title: 'Livraison, cueillette, heures d’ouverture',
        text: "Des questions logistiques simples, répétées toute la journée, qui n'ont pas besoin de vous pour trouver leur réponse.",
      },
    ],
    steps: [
      {
        title: "Collez l'adresse de votre site",
        text: "Aucune installation technique. On lit vos pages — produits, marques, livraison, heures d'ouverture.",
      },
      {
        title: 'Votre assistant est prêt en quelques secondes',
        text: "Il répond avec vos vraies marques, vos vrais formats et vos vraies modalités — pas un catalogue générique.",
      },
      {
        title: 'Un seul lien à coller sur votre site',
        text: "Une ligne de code, fournie automatiquement. Vos clients obtiennent une réponse pendant que vous êtes sur le plancher.",
      },
    ],
    trust: [
      {
        icon: ShieldCheck,
        iconClass: 'text-brand-700',
        title: 'Vos données, isolées',
        text: "Le contenu de votre site et les échanges avec vos clients restent strictement séparés de tout autre commerce.",
      },
      {
        icon: PackageSearch,
        iconClass: 'text-emerald-600',
        title: 'Répond à partir de votre catalogue',
        text: "Les marques, formats et prix viennent de vos propres pages : l'assistant ne propose rien que vous ne vendez pas.",
      },
      {
        icon: PawPrint,
        iconClass: 'text-sky-600',
        title: 'Bilingue, sans configuration',
        text: 'Répond aussi bien en français qu’en anglais à partir du même contenu, pour les clientèles mixtes.',
      },
    ],
    closing: {
      title: 'Voyez ce que ça donne avec le site de votre boutique',
      text: 'Aucune carte de crédit requise pour essayer. Ça prend moins d’une minute.',
    },
  },
];

// Registry (identity) + content (copy), joined on `view`. A registry entry
// with no copy block yet simply doesn't render — better than a half-built
// page going live because someone added a slug.
export const NICHES = NICHE_REGISTRY
  .map((entry) => {
    const content = CONTENT.find((c) => c.view === entry.view);
    return content ? { ...entry, ...content } : null;
  })
  .filter(Boolean);

/** The niche rendered at a given view key, or null for any other view. */
export function nicheForView(view) {
  return NICHES.find((niche) => niche.view === view) || null;
}

/** True when a view key belongs to a niche landing page. */
export function isNicheView(view) {
  return NICHES.some((niche) => niche.view === view);
}
