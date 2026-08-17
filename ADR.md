# B2B AI Chatbot - Architecture Decision Records (ADR)

Ce document retrace toutes les décisions importantes concernant l'architecture, le flux utilisateur et le design de l'application, afin d'éviter les régressions futures.

---

## ADR 028 : Remplacement des Parseurs Custom par des Bibliothèques Standards (Widget)
**Date:** 16 Août 2026
**Statut:** Accepté

### Contexte
Le projet contenait plusieurs implémentations "maison" fastidieuses et potentiellement fragiles (ou peu sécurisées) dans le widget client Vanilla JS :
- Un parseur Markdown `apps/widget/src/markdown.js` basé sur des Regex basiques qui présentaient des failles de style sur certains sauts de lignes ou combinaisons de listes.
- Un gestionnaire de streaming SSE (`apps/widget/src/chat.js`) qui fractionnait manuellement le tampon de texte reçu via `TextDecoder` (risque de coupure au milieu d'un événement `\n\n`).

### Décision
1. **Markdown & Sécurité** : Suppression du parseur Regex "maison" au profit de la bibliothèque `marked` (robuste et standardisée), couplée à `dompurify` pour garantir une sanétisation XSS stricte avant injection HTML.
2. **Streaming SSE** : Remplacement de la boucle `reader.read()` manuelle par `@microsoft/fetch-event-source`, qui gère nativement le standard *Server-Sent Events* et prévient les erreurs de découpage de flux réseau.
3. **Styles CSS** : Nettoyage de `widget.css` pour cibler les balises standards (`p`, `ul`, `a`, `code`) dans `.b2b-msg` plutôt que des classes CSS générées artificiellement (`.b2b-link`, `.b2b-p`).

### Conséquences
- Code source drastiquement simplifié, plus fiable et sécurisé.
- Taille du widget très légèrement augmentée (86 Ko), mais un fonctionnement sans failles.

---

## ADR 027 : Support Intégral du Markdown (Widget Vanilla JS, Sandbox Admin et Prompt Système)
**Date:** 16 Août 2026
**Statut:** Accepté

### Contexte
Les réponses de l'assistant contenaient de la syntaxe Markdown (mots en gras `**`, listes à puces `-`, liens cliquables `[texte](url)`, blocs de code) qui s'affichaient sous forme de texte brut avec des astérisques et crochets dans le widget embarqué client. De plus, le prompt système nécessitait des directives explicites pour structurer naturellement les réponses avec des paragraphes aérés et des listes lisibles.

### Décision
1. **Parseur Markdown Sécurisé & Léger dans le Widget Client (`apps/widget/src/markdown.js`)** :
   - Sanitization automatique contre les injections XSS.
   - Parsing en temps réel des éléments Markdown : gras (`**`), italique (`*`), titres (`###`), liens cliquables (`[texte](url)` ouvrant en `target="_blank"` avec icône ↗), listes à puces (`- ` / `* `) et listes numérotées (`1. `), code inline (`` `code` ``) et blocs de code (```` ```code``` ````), citations (`> `), paragraphes et sauts de ligne.
   - Rendu fluide durant le streaming (`onChunk`) et lors des messages finaux.
2. **Typographie et Styles CSS Dédiés (`apps/widget/src/widget.css`)** :
   - Styles dédiés pour les paragraphes (`.b2b-p`), liens avec soulignement contrasté (`.b2b-link`), listes indentées (`.b2b-list`), blocs de code sombres (`.b2b-code-block`) et titres hiérarchisés.
3. **Rendu Personnalisé dans l'Aperçu Admin (`ClientOnboarding.jsx`)** :
   - Configuration de `ReactMarkdown` avec des composants sur mesure pour styliser les liens `<a>`, le texte en gras `<strong>`, les listes `<ul>`/`<ol>` et les balises `<code>`.
4. **Directives de Formatage dans le Prompt Système (`api/chat.js`)** :
   - Instruction formelle donnée au LLM d'utiliser un Markdown soigné, de mettre en valeur les termes clés en gras, d'énumérer les choix sous forme de listes à puces, de fournir des liens cliquables et de rédiger des paragraphes concis.

### Conséquences
- Expérience de lecture professionnelle, moderne et fluide tant sur le widget public que dans la console d'administration.
- Présentation claire des listes de services, garanties, tarifs et liens externes.

---

## ADR 026 : Contournement Universel des Blocages d'Incrustation Iframe (`X-Frame-Options` / CSP) & Schéma Supabase Consolidé
**Date:** 16 Août 2026
**Statut:** Accepté

### Contexte
1. De nombreux sites web clients intègrent des en-têtes HTTP de sécurité stricts (`X-Frame-Options: SAMEORIGIN` ou `DENY`, `Content-Security-Policy: frame-ancestors 'self'`) qui bloquent leur affichage au sein d'une balise `<iframe>` lors de la prévisualisation dans `preview.html`.
2. La base de données Supabase Cloud présentait un décalage par rapport aux récentes fonctionnalités (colonnes de souscription Stripe sur `tenants`, tables `site_summaries`, `usage_counters` et `scan_jobs`).

### Décision
1. **Endpoint Proxy Anti-Frame-Blocker (`/api/preview-proxy`)** :
   - Création de `api/preview-proxy.js` qui récupère le HTML du site distant côté serveur.
   - Suppression systématique des en-têtes bloquants (`X-Frame-Options`, `Content-Security-Policy`).
   - Injection automatique de la balise `<base href="...">` afin que tous les scripts, feuilles de style CSS, polices et images relatifs se chargent sans aucune altération visuelle.
   - Neutralisation des scripts JavaScript de dé-cadrage ("frame-busters").
2. **Interface de Prévisualisation Enrichie (`preview.html`)** :
   - Utilisation par défaut du mode Proxy Anti-Blocage avec indicateur d'état actif.
   - Sélecteur de viewport responsive (Desktop 100%, Tablette 768px, Mobile 390px) avec bordures réalistes.
   - Boutons de rechargement rapide, d'ouverture directe et de bascule manuelle en cas de besoin.
3. **Schéma SQL Supabase Consolidé** :
   - Fichier de migration consolidé `supabase/consolidated_latest_migrations.sql` regroupant l'ensemble des DDLs à jour (`tenants`, `leads`, `site_summaries`, `usage_counters`, `scan_jobs`).
   - Script de vérification automatisé `scripts/check-supabase-status.js` pour auditer à tout moment la conformité des tables et fonctions RPC.

### Conséquences
- 100% des sites web clients peuvent être prévisualisés avec le chatbot superposé sans aucun message d'erreur de blocage navigateur.
- Suivi clair et script prêt à l'emploi pour garantir l'intégrité de la base de données Supabase Cloud.

---

## ADR 025 : Intégration de la Page de Prévisualisation Dédiée (`preview.html`) et Assainissement de la CI GitHub Actions
**Date:** 16 Août 2026
**Statut:** Accepté

### Contexte
1. L'action d'ouverture de l'aperçu du site dans un nouvel onglet redirigeait directement vers le domaine brut externe sans injecter le chatbot d'assistance. Une page enveloppe dédiée (`preview.html`) a été introduite pour charger le site client dans une iframe tout en superposant le widget d'assistant en direct.
2. Un commit distant antérieur avait accidentellement écrasé `ClientOnboarding.jsx` avec un extrait textuel de patch git au lieu d'appliquer la modification. Ce composant clé devait être restauré et mis à jour proprement.
3. Le workflow GitHub Actions initial (`deploy.yml`) exécutait des tests avec effets de bord sur la base de données de production et tentait des déploiements CLI Vercel redondants nécessitant des secrets non configurés, générant des échecs d'exécution récurrents.

### Décision
1. **Restauration et Intégration Sécurisée de `ClientOnboarding.jsx`** :
   - Restauration de l'intégralité du composant `ClientOnboarding.jsx`.
   - Mise à jour du bouton "Ouvrir dans un nouvel onglet" vers `/preview.html?domain=...&tenant_key=...&api_url=...` pour un aperçu dynamique complet.
2. **Synchronisation du Bundle Widget** :
   - Mise à disposition de `widget.iife.js` dans les fichiers statiques de l'admin (`apps/admin/public/widget.iife.js`) pour garantir le chargement local et distant immédiat dans `preview.html`.
3. **Nettoyage et Modernisation de la CI (`.github/workflows/ci.yml`)** :
   - Remplacement de `deploy.yml` par un pipeline `ci.yml` propre, rapide et sans effets de bord.
   - Ajout d'un mécanisme d'annulation de concurrence (`concurrency: cancel-in-progress: true`) pour optimiser l'utilisation des runners GitHub.
   - Compilation et validation automatisées de tous les modules du monorepo (`@b2b-ai-chatbot/shared`, `@b2b-ai-chatbot/widget`, `@b2b-ai-chatbot/admin`).
   - Ajout d'un script de test unitaire rapide (`scripts/test-schemas.js`) validant les contrats Zod sans polluer la base de données.

### Conséquences
- Prévisualisation live du chatbot sur n'importe quel site web client dans un onglet dédié.
- Codebase saine et zéro régression dans l'espace d'onboarding.
- Pipeline GitHub Actions 100% vert, propre et sans dépendances critiques fragiles.

---

## ADR 024 : Harmonisation du Moteur IA sur GPT Luna (`openai/gpt-5.6-luna`) pour Tous les Forfaits
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Pour garantir une expérience ultra rapide, homogène et de haute précision à travers l'ensemble des fonctionnalités et des forfaits de la plateforme, l'ensemble des flux de chat et d'agents doivent utiliser le modèle GPT Luna (`openai/gpt-5.6-luna`).

### Décision
1. **Routage Unifié vers `openai/gpt-5.6-luna`** :
   - Dans `api/chat.js`, tous les forfaits (Free, Basic, Pro, Enterprise) routent directement vers `openai/gpt-5.6-luna`.
   - Dans `api/lib/llm.js`, la constante par défaut `DEFAULT_OPENROUTER_MODEL` et les assistants d'extraction (leads, synthèses) sont configurés sur `openai/gpt-5.6-luna`.
2. **Mise à Jour des Fiches Forfaits** :
   - Les cartes de prix et fonctionnalités dans `Pricing.jsx` mentionnent l'accélération GPT Luna sur toutes les offres.

### Conséquences
- Temps de réponse réduit, streaming ultra réactif et excellente capacité d'extraction/raisonnement sur l'ensemble de l'application.

---

## ADR 023 : Modale Interactive de Sélection de Pages pour les Grands Sites (Zéro Omission Silencieuse)
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Lorsqu'un site web dépasse la limite de pages d'un forfait (ex: plus de 500 pages découvertes), le système ne doit en aucun cas ignorer ou tronquer des pages silencieusement. L'utilisateur doit recevoir un avertissement explicite et pouvoir choisir précisément les pages à indexer ou mettre à niveau son forfait.

### Décision
1. **Zéro Omission Silencieuse** :
   - Le crawler découvre et liste 100% des URLs disponibles sans restriction initiale.
2. **Modale d'Avertissement & Sélecteur Interactif (`showPageSelectionModal`)** :
   - Si le nombre total de pages découvertes dépasse le quota du plan, le processus de scan automatique se met en pause et ouvre une modale dédiée.
   - Pré-sélection intelligente des premières pages (`Top N`) avec possibilité de cocher/décocher n'importe quelle page.
   - Barre de recherche en temps réel pour filtrer les pages par chemin ou titre.
   - Compteur de sélection dynamique (`X / Y pages`) bloquant le dépassement avec explication claire.
   - Bouton d'action directe "Upgrade Plan →" pour lever toutes les limites.
   - Bouton de confirmation "Confirm & Index Selected Pages" pour lancer l'indexation de la sélection personnalisée.

### Conséquences
- Transparence totale pour les clients ayant de volumineux catalogues ou documentations.
- Maîtrise totale de la sélection de contenu indexé dans la base vectorielle.

---

## ADR 022 : Hausse du Seuil de Blocage à 500 Pages, Découverte Multi-Sitemaps & Pagination DB
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Le seuil de blocage et de notification de quotas devait être assoupli pour ne déclencher aucun blocage en dessous de 500 pages. De plus, la découverte des sous-sitemaps devait supporter jusqu'à 50 flux parallèles et la récupération des pages indexées devait lever la limite par défaut de 1000 lignes de Supabase postgREST.

### Décision
1. **Seuil de 500 Pages pour les Forfaits Standards** :
   - Aucun avertissement ou blocage n'est déclenché tant que le site contient 500 pages ou moins.
   - Les forfaits Pro supportent jusqu'à 2 000 pages et Enterprise jusqu'à 9 999+ pages.
2. **Support de 50 Sous-Sitemaps en Parallèle** :
   - Extension de la découverte `crawl-site.js` pour explorer jusqu'à 50 sous-sitemaps simultanément.
3. **Suppression du Plafond de Lignes Supabase (`.limit(10000)`)** :
   - Dans `fetchIndexedPages`, ajout d'un `.limit(10000)` explicite sur la requête des documents pour éviter la troncature silencieuse à 1000 chunks (qui pouvait limiter l'affichage à ~50 pages).

### Conséquences
- Zéro blocage pour tous les sites web contenant jusqu'à 500 pages.
- Indexation et affichage garantis de l'intégralité des sections et sous-pages du site.

---

## ADR 021 : Apprentissage Intégral sans Limite à l'Onboarding & Avertissement de Quotas au Déploiement
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Lors de la découverte initiale d'un site web pendant l'onboarding, un seuil arbitraire de pages (ex: 15 pages) tronquait l'indexation de sites complets comme Delafontaine (~28 pages), dégradant l'expérience de test et de démonstration du bot. Le client doit pouvoir tester l'IA sur l'ensemble de son contenu sans restriction lors de l'onboarding, et n'être soumis aux quotas que lors du déploiement réel du widget sur son site web.

### Décision
1. **Suppression Totale de la Limite de Pages à l'Onboarding** :
   - Pendant le scan initial et les re-scans, 100% des pages découvertes sont scannées, indexées et apprises sans aucun découpage artificiel.
2. **Avertissement de Quota Contextuel au Déploiement** :
   - Lorsque l'utilisateur ouvre la modale d'intégration du widget (`showIntegrationModal`) :
     - Si le nombre de pages actives dépasse le forfait (ex: > 15 pages sur Free ou > 50 pages sur Basic) :
       - Affichage d'un encart d'avertissement clair détaillant le dépassement (`X / Y pages`).
       - Bouton d'action directe "Upgrade Plan →" pour passer au forfait supérieur.
       - Bouton d'action "Manage & Deactivate Pages" qui redirige vers le tableau de la base de connaissances pour désactiver les pages superflues si le client souhaite rester sur son forfait actuel.

### Conséquences
- Expérience d'onboarding complète, valorisante et sans friction.
- Incitation naturelle à l'upgrade au moment clé du déploiement en production.

---

## ADR 020 : Suppression Sécurisée de Sites Web & Nettoyage en Cascade
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Les utilisateurs souhaitaient pouvoir supprimer un site web obsolète ou erroné directement depuis le tableau de bord sans devoir nettoyer la base de données manuellement.

### Décision
1. **Bouton de Suppression & Modale de Confirmation** :
   - Ajout d'un bouton de suppression rouge avec icône corbeille (`Trash2`) dans la barre d'action du site actif.
   - Modale de confirmation explicite (`showDeleteConfirmModal`) pour prévenir toute suppression accidentelle.
2. **Nettoyage en Cascade des Données** :
   - Suppression en cascade dans Supabase de tous les documents (`documents`), résumés (`site_summaries`) et de la ligne du site (`sites`).
3. **Mise à Jour Dynamique de l'UI** :
   - Si d'autres sites existent, l'interface bascule automatiquement sur le site suivant sans rafraîchissement forcé.
   - Si le dernier site est supprimé, l'interface revient proprement à l'écran d'accueil d'onboarding.

### Conséquences
- Gestion du cycle de vie des sites web complète et sécurisée pour les clients et administrateurs.

---

## ADR 019 : Limites de Forfaits (Sites/Pages/Modèles LLM), Gestion Multi-Sites Non-Bloquante, Navigation Leads & Optimisation du Crawl/Streaming
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
1. L'application nécessitait une hiérarchisation claire des forfaits (Free, Basic, Pro, Enterprise) avec des quotas précis de sites web et de pages indexables, et un routage dynamique vers des modèles légers (Free/Basic) ou des modèles avancés de raisonnement (Pro/Enterprise).
2. L'ajout d'un second site réinitialisait l'interface au lieu d'offrir une expérience multi-sites fluide.
3. La section des prospects capturés (Leads) n'était pas accessible si la liste était vide ou depuis le menu principal.
4. L'aperçu du résumé IA présentait des risques de faible contraste (texte blanc sur fond blanc selon les navigateurs).
5. La performance d'indexation devait être accélérée et les appels d'outils techniques (tool calls) devaient être masqués au profit d'un streaming fluide.

### Décision
1. **Tiering des Plans et Modèles IA Dédiés** :
   - **Free ($0)** : 1 site max, 15 pages max, modèle léger `google/gemini-2.0-flash-001`.
   - **Basic ($45 CAD)** : 1 site max, 50 pages max, modèle rapide optimisé `openai/gpt-4o-mini`.
   - **Pro ($129 CAD)** : Jusqu'à 5 sites, 250 pages/site, modèle de raisonnement avancé `openai/gpt-4o`.
   - **Enterprise (Custom)** : Sites et pages illimités, modèle haute fidélité `anthropic/claude-3.5-sonnet`.
2. **Navigation Principale et Accès Permanent aux Leads** :
   - Ajout d'onglets de navigation en haut de page (`Dashboard`, `Leads`, `Plans`) dans le Header et le header invité.
   - La page Leads est toujours consultable (avec tableau de bord, export CSV et message d'accueil explicatif).
3. **Gestion Multi-Sites Non-Bloquante** :
   - Ajout d'une barre de sélection de site (pills/onglets) sur le tableau de bord lorsqu'un client possède plusieurs sites.
   - Modale dédiée non-bloquante `showAddSiteModal` pour ajouter un nouveau domaine avec contrôle des quotas du forfait actif.
4. **Correction du Contraste de Résumé IA & Éditeur de Pages** :
   - Application explicite des styles de fond sombre (`#090d16`) et texte clair (`#f3f4f6`) sur tous les textareas.
5. **Accélération du Pipeline de Crawl et Streaming Chat Épuré** :
   - Découverte des sitemaps en parallèle avec `Promise.allSettled` et timeout d'abandon de 2.5s.
   - Concurrence d'indexation des pages augmentée à 10x.
   - Masquage intégral des blocs bruts de debug `tool_call` dans le widget et l'aperçu, avec streaming direct du texte à 8ms.

### Conséquences
- Architecture multi-sites robuste sans aucun verrouillage de l'interface.
- Expérience de discussion épurée et naturelle pour les visiteurs finaux.
- Offre commerciale et quotas techniques parfaitement alignés sur le backend et le frontend.

---

## ADR 018 : Simplification de l'Espace Client, Modale de Progression d'Apprentissage & Localisation Anglaise
**Date:** 15 Août 2026
**Statut:** Accepté

### Contexte
Pour un nouvel utilisateur, l'espace d'administration présentait trop d'options simultanément (formulaires de prompt, boutons de tons, gestionnaire de base de connaissances volumineux), ce qui créait de la confusion quant à l'action principale à effectuer ("Où aller ? Que faire maintenant ?"). De plus, l'apprentissage du site web manquait de visibilité et l'ensemble de la plateforme devait être traduit en anglais.

### Décision
1. **Modale Dédiée d'Apprentissage avec Barre de Progression** :
   - Affichage d'une fenêtre modale interactive (`showLearningModal`) dès le lancement de l'onboarding ou d'un re-scan.
   - Barre de progression animée (0% à 100%) avec étapes visuelles détaillées (Découverte des pages du sitemap, Indexation vectorielle sémantique, Génération du résumé d'entreprise par l'IA).
   - Écran de félicitation avec bouton d'action directe "Test My Bot Now →" ouvrant immédiatement l'aperçu live plein écran.
2. **Clarification du Dashboard & Regroupement des Options Secondaires** :
   - Carte Hero épurée mettant en avant le statut de l'assistant (Actif & En Ligne), la clé publique et les 3 actions clés (Test Live, Intégration widget, Re-scan).
   - Guide d'onboarding rapide en 3 étapes claires (1. Apprentissage IA validé -> 2. Test sandbox en direct -> 3. Intégration du script).
   - Section accordéon / déroulante "Advanced Settings & Knowledge Base" masquant par défaut les options secondaires (Couleur du widget, Capture de prospects, Objectif, Ton de voix, Éditeur de résumé, Tableau de gestion des URLs).
3. **Traduction Intégrale en Anglais** :
   - Traduction complète de l'interface d'administration (Header, Onboarding, Modales, Table de prospects, Pricing, Écran de succès Stripe) et du widget embarqué (salutation par défaut, statuts d'outils, formulaires de secours).

### Conséquences
- Expérience d'onboarding fluide, guidée et engageante pour tout nouvel arrivant.
- Tableau de bord ultra épuré tout en conservant l'accès direct aux réglages avancés via l'accordéon.
- Plateforme 100% bilingue prête pour les marchés anglophones et internationaux.

---

## ADR 008 : Interdiction des Salutations Répétitives & Fallback de Résumé d'Entreprise
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Lorsqu'un utilisateur posait une question générale dès le début ("que faites vous ?"), le chatbot répondait en répétant une formule générique de présentation de lui-même ("Bonjour, je suis l'assistant virtuel..."), créant une impression de "double/triple message d'intro". De plus, si la table `site_summaries` n'était pas encore peuplée pour un site, le prompt système n'avait aucun résumé de l'entreprise sous la main.

### Décision
1. **Interdiction Formelle des Salutations Répétitives** : Le widget affiche déjà un message d'accueil initial au visiteur. L'IA a désormais l'ordre strict de répondre **directement et immédiatement** à la question posée sans réutiliser de formules d'introduction ("Bonjour, je suis l'assistant...").
2. **Fallback Automatique sur les Documents d'Origine** : Si aucun résumé IA explicite n'existe encore dans `site_summaries`, l'API extrait automatiquement les premiers documents indexés du client pour alimenter le résumé d'entreprise du système prompt.
3. **Réponse Obligatoire aux Questions d'Activité** : À la question "que faites-vous ?", l'IA doit utiliser le résumé d'entreprise pour lister directement les vraies prestations au lieu de répéter une politesse vide.

### Conséquences
- Suppression intégrale des boucles de messages d'intro.
- L'IA présente instantanément les vrais produits/services du client dès la première question générale.

---

## ADR 007 : Directives Anti-Hallucination Strictes, Contexte Temporel et Suppression des Modes de Test Mock
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Le chatbot pouvait parfois générer des hallucinations sur les numéros de téléphone (ex: `[numéro de téléphone]`), inventer des heures d'ouverture génériques (9h à 18h) ou prendre une identité hardcodée (ex: "Portes Delafontaine") en raison d'un résidu de `TEST_MODE` et d'une absence de règles explicites d'interdiction de placeholders et d'inventions de données de contact.

### Décision
1. **Désactivation intégrale du TEST_MODE** : `TEST_MODE` est forcé à `false` dans `api/lib/llm.js` afin d'empêcher toute injection de réponses/données factices "Delafontaine".
2. **Injection du Contexte Temporel** : La date, le jour de la semaine et l'heure courante sont automatiquement injectés dans le `systemPrompt` pour que l'IA connaisse le moment présent.
3. **Directives Anti-Hallucination Strictes** :
   - Interdiction absolue d'inventer des numéros de téléphone, des adresses, des horaires ou des tarifs.
   - Interdiction stricte d'utiliser des placeholders textuels (`[numéro de téléphone]`).
   - Obligation d'avouer l'absence d'information si la donnée n'est pas dans le RAG ou le résumé du site, et de proposer la capture de coordonnées (Leads).

### Conséquences
- Éradication des réponses avec placeholders ou fausses informations de contact.
- Fiabilité et crédibilité maximales des assistants générés pour les clients B2B.

---

## ADR 001 : Suppression de l'upload de documents manuels
**Date:** 9 Août 2026
**Statut:** Accepté

### Contexte
La plateforme est conçue pour permettre une intégration "en 1 clic" via l'URL du site web. Des questions se posaient sur la nécessité d'ajouter un système manuel d'upload de fichiers (PDF, Word) en guise de repli lorsque le scraping d'URL échoue.

### Décision
Nous **ne développerons pas** de fonctionnalité d'upload manuel de documents dans l'interface utilisateur. En cas d'erreur de scraping, le client est invité à nous contacter, et nous gèrerons le scraping manuellement de notre côté. 

### Conséquences
- **Avantage** : L'expérience utilisateur (UX) reste extrêmement simple, épurée et sans friction (Aha moment rapide). L'architecture reste légère et nous évitons les coûts/gestion complexes du stockage de fichiers (S3/Supabase Storage) côté client.
- **Inconvénient** : Les erreurs de scraping demandent une intervention manuelle (Support).

---

## ADR 002 : Design B2B "Corporate/Clean" pour l'Espace Client
**Date:** 9 Août 2026
**Statut:** Accepté

### Contexte
Le design initial du dashboard (Admin) utilisait un thème "Dark Mode / Néon" fortement inspiré du Web3 (effets de `animate-glow`, flou intense, couleurs vives très contrastées). Le public cible B2B de nos démos inclut des notaires, des cliniques dentaires, des garages, etc.

### Décision
Nous adoptons un design **Corporate et Épuré** pour le tableau de bord :
1. Suppression des statistiques non essentielles (`OverviewStats`) en haut du tableau de bord pour éviter l'encombrement visuel.
2. Suppression des effets de "Glow" et des halos lumineux intenses.
3. Utilisation de fonds sombres beaucoup plus neutres (`bg-dark-800`) et de bordures subtiles (`border-white/5`) au lieu d'effets Glassmorphism très marqués.

### Conséquences
- L'outil paraîtra plus sérieux et fiable aux yeux de professionnels traditionnels (santé, juridique).
- Le widget final encastré chez le client restera quant à lui 100% modifiable (couleur primaire) pour s'adapter à leur propre image de marque.
- **Règle** : Toute future addition à l'interface d'administration doit respecter cette sobriété.

---

## ADR 003 : Transparence de l'Indexation et des Sources (RAG)
**Date:** 9 Août 2026
**Statut:** Accepté

### Contexte
L'extraction et l'indexation de pages (Jina/Crawling) étaient des "boîtes noires" : l'utilisateur cliquait et devait attendre sans trop savoir pourquoi, et le chatbot testé ne citait pas ses sources.

### Décision
Pour bâtir la confiance :
1. Un statut granulaire textuel s'affiche désormais sous la barre de recherche lors de l'onboarding ("Analyse de la charte graphique...", "Lecture et apprentissage...").
2. Dans le chat d'Aperçu (Test), lorsque l'outil `search_knowledge_base` est appelé, l'interface affiche explicitement les **liens sources** lus par l'IA.
3. Un champ de recherche textuel a été ajouté au-dessus du gestionnaire de base de connaissances pour naviguer facilement dans de gros sites.

### Conséquences
- Augmentation drastique de la confiance de l'utilisateur envers les réponses du Bot.
- Une UX plus engageante durant les temps de chargement d'indexation.

---

## ADR 004 : Utilisation exclusive de requêtes SQL brutes (Pas d'ORM)
**Date:** Décision Initiale
**Statut:** Accepté

### Contexte
L'application doit être déployée sur Vercel Edge Functions pour une latence minimale, où certains ORMs (comme Prisma) peuvent être lourds ou difficiles à configurer.

### Décision
Nous interdisons l'utilisation d'ORMs (Pas de Prisma, pas de Drizzle). Toutes les interactions avec la base de données doivent se faire via le client Supabase standard et les migrations en SQL brut.

### Conséquences
- **Avantage** : Légèreté maximale, exécution rapide sur le Edge, et plein contrôle sur les fonctionnalités avancées de Postgres (pgvector, Full Text Search).
- **Inconvénient** : Le typage TypeScript doit être géré manuellement ou via le générateur de types Supabase, et l'écriture de requêtes complexes nécessite une bonne maîtrise du SQL.

---

## ADR 005 : API Serverless intégrée au frontend Admin
**Date:** Décision Initiale
**Statut:** Accepté

### Contexte
Le projet est un monorepo, mais nous voulons des déploiements Vercel simples sans configurations complexes de routage monorepo.

### Décision
Toutes les fonctions API serverless (LLM, RAG, Web Scraping) sont stockées dans le dossier `apps/admin/api/` au lieu de la racine du monorepo.

### Conséquences
- **Avantage** : Un seul déploiement Vercel gère à la fois l'application React Vite (Admin SPA) et les Edge Functions.
- **Inconvénient** : Le code backend est couplé au dossier du frontend d'administration.

---

## ADR 006 : Onboarding sans friction via des "Guest Tenants"
**Date:** Décision Initiale
**Statut:** Accepté

### Contexte
Nous voulons que les utilisateurs expérimentent le "Aha Moment" (le bot fonctionne sur leur site) avant même de s'inscrire ou de laisser leur email.

### Décision
Lorsqu'un utilisateur non connecté teste une URL, le système crée un locataire invisible préfixé par `Guest_`. Un script `cleanup-guests.js` purge ces données après 24 heures pour éviter de polluer la base de données.

### Conséquences
- **Avantage** : Taux de conversion maximal.
- **Inconvénient** : Nécessite une gestion asynchrone du nettoyage (cron job) et une logique de migration (convertir un Guest en compte réel lors de l'inscription).

---

## ADR 007 : Séparation stricte Base de Données Production / Développement
**Date:** 10 Août 2026
**Statut:** Accepté

### Contexte
Lors d'une session de développement, la commande `supabase db reset` a été exécutée afin de consolider les migrations SQL. Cette commande a effacé la base de données Supabase en ligne (production), supprimant les données de tous les clients déjà onboardés (tenants, sites, documents, clés publiques).

### Décision
La commande `supabase db reset` (et toute commande destructive similaire) est **INTERDITE** sur la base de données de production Supabase. Cette commande doit uniquement être utilisée dans un environnement **local Docker** (`supabase start`).

Les règles à respecter sont :
1. **Local uniquement** : `supabase db reset` → uniquement après `supabase start` (Docker local).
2. **Production** : Les modifications de schéma en production se font exclusivement via `supabase migration new` + `supabase db push` (pas de reset).
3. **Vérification obligatoire** : Avant tout `db reset`, vérifier que `supabase status` affiche `Local` et non une URL Supabase cloud.

### Conséquences
- **Avantage** : Les données de production (clients, sites, documents indexés, clés d'API) sont protégées.
- **Inconvénient** : Les migrations doivent être testées localement avant d'être poussées en production. Cela requiert que Docker Desktop soit installé sur la machine de développement.

---

## ADR 008 : Amélioration du Pipeline RAG — Chunking, FTS Bilingue et Jeu de Tests
**Date:** 10 Août 2026
**Statut:** Accepté

### Contexte
Après inspection de la base Supabase pour `delafontaine.ca`, trois problèmes critiques ont été identifiés :
1. Les 13 chunks indexés étaient tous issus d'une seule URL (`/`) — aucune sous-page indexée.
2. 6 chunks sur 13 contenaient du bruit RGPD/cookies (Google Analytics, CookieYes) — polluant les réponses du bot.
3. La recherche FTS utilisait uniquement la config `french` sur un site **en anglais** → 0 résultats pour toute requête anglaise.

### Décision

**Chunking :** Remplacement de `chunkText()` (découpage naïf par taille) par `cleanAndChunk()` dans `start-scan.js` ET `update-document.js`. La nouvelle fonction :
- Découpe par **paragraphes sémantiques** (double newline / headers markdown)
- **Filtre** les paragraphes contenant des patterns de bruit (cookie, cookieyes, GTM, VISITOR_INFO, etc.)
- Exige un minimum de 25 mots de contenu utile par chunk
- Fonctionne pour le français ET l'anglais

**FTS Bilingue :** Migration `20260810000001_multilingual_fts.sql` :
- Ajout colonne `fts_en tsvector` (config `english`) sur la table `documents`
- Nouvelle RPC `search_documents_fts` qui cherche dans `fts` (fr) OU `fts_en` (en) et retourne le meilleur score
- Mise à jour de `match_documents_hybrid` pour supporter les deux langues
- Utilisation de `plainto_tsquery` (OR souple) plutôt que `websearch_to_tsquery` (AND strict)

**`chat.js` :** Remplacement du `textSearch()` mono-langue par la RPC `search_documents_fts` avec fallback automatique sur l'ancien `textSearch` si la migration n'est pas encore déployée.

**Ré-ingéstion :** Script `reingest-delafontaine.mjs` — 12 pages ingérées via Jina Reader, résultat : 23 chunks propres sur 9 URLs (vs 13 chunks pollus sur 1 URL).

**Tests :** Script `test-rag-search.js` — 17 cas de test couvrant :
- Groupe A (10) : happy path — contenu métier confirmé
- Groupe B (2) : bilingue FR→EN (tests informatifs, limite FTS attendue)
- Groupe C (3) : négatifs stricts (hors-sujet, RGPD, prix absents)
- Groupe D (2) : qualité — absence de bruit, pertinence du ranking

Résultat final : **17/17 tests passent (100%)**.

### Conséquences
- **Avantage** : Toute future ingéstion (nouvel onboarding client) bénéficie automatiquement du filtre de bruit et du FTS bilingue.
- **Avantage** : Le bot peut répondre correctement aux questions en anglais sur des sites anglophones.
- **Limite restante** : Les requêtes françaises sur du contenu anglais ne sont pas encore couvertes par FTS (nécessite des embeddings sémantiques — étape future).
- **Règle** : Tout changement à la logique de chunking DOIT être appliqué simultanément dans `start-scan.js` ET `update-document.js` pour garder la cohérence.

---

## ADR 009 : Intégration des Embeddings Sémantiques Multilingues Jina AI v3 (768d)
**Date:** 10 Août 2026
**Statut:** Accepté

### Contexte
Bien que le FTS bilingue (ADR-008) ait résolu les requêtes exactes en français et en anglais, il présentait deux limites fondamentales :
1. **Match cross-langues** : Une question posée en français (`"entreprise familiale"`) sur un site 100% anglais (`delafontaine.ca`) retournait 0 résultat FTS.
2. **Recherche conceptuelle** : Les synonymes et requêtes paraphrasées sans mots-clés exacts n'étaient pas capturés.

### Décision

1. **Modèle d'Embeddings** : Adoption de **`jina-embeddings-v3`** (Jina AI) configuré à **768 dimensions**, qui matche exactement la colonne Supabase `embedding vector(768)` sans modification de schéma SQL.
2. **Task-Specific Embeddings** :
   - `retrieval.passage` pour le batch chunking lors de l'ingestion (`start-scan.js`, `update-document.js`, `reingest-delafontaine.mjs`).
   - `retrieval.query` pour les requêtes de recherche utilisateur dans `api/chat.js`.
3. **Recherche Hybride RRF (Reciprocal Rank Fusion)** : L'API `chat.js` génère l'embedding de la requête utilisateur et appelle la RPC `match_documents_hybrid` qui combine :
   - Distance cosinus sémantique (`embedding <=> query_embedding`)
   - Rank FTS bilingue (`fts` FR + `fts_en` EN)
   - Fallback gracieux sur FTS bilingue pur ou `textSearch` si la clé ou le service d'embeddings est indisponible.
4. **Validation par Suite de Tests** : 17/17 tests RAG valides avec **100% de réussite** sur `match_documents_hybrid (Semantic Vector 768d + FTS)`. Les requêtes cross-langues FR → EN (`"entreprise familiale"`, `"portes acier coupe-feu"`) retournent les bons chunks pertinents.

### Conséquences
- **Avantage** : Recherche RAG sémantique multilingue robuste supportant le français, l'anglais, les synonymes et les paraphrases.
- **Avantage** : Résilience maximale avec fallback automatique sur FTS bilingue si l'API d'embedding échoue.
- **Sécurité/Performance** : Batching d'embeddings lors de l'ingestion (1 seul appel HTTP par page).

---

## ADR 010 : Intégration du Paiement via Stripe (Subscriptions + Billing Portal)
**Date:** 11 Août 2026
**Statut:** Accepté

### Contexte
La plateforme avait une page `Pricing.jsx` avec des plans (Starter 29$/mois, Pro 99$/mois, Enterprise sur mesure) mais aucun mécanisme de paiement réel. L'objectif est de rendre la plateforme payante en utilisant un fournisseur de paiement standard.

### Décision
Nous adoptons **Stripe** comme fournisseur de paiement unique, avec les composants suivants :

1. **Stripe Checkout** (mode `subscription`) — Page de paiement hébergée par Stripe, sans PCI-DSS côté client.
2. **Stripe Billing Portal** — Portail client Stripe pour gérer les abonnements (annulation, changement de CB, factures).
3. **Stripe Webhooks** — Synchronisation asynchrone de l'état d'abonnement dans Supabase (`tenants.plan`, `plan_status`, `stripe_subscription_id`).

**Fichiers créés :**
- `api/create-checkout-session.js` — Crée la session Checkout, attache/crée le Customer Stripe.
- `api/create-portal-session.js` — Crée la session Billing Portal.
- `api/stripe-webhook.js` — Traite `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`.
- `supabase/migrations/20260811000001_stripe_billing.sql` — Ajoute `stripe_subscription_id`, `plan_status`, `plan_expires_at` sur `tenants`.
- `src/components/PlanBadge.jsx` — Badge plan actuel visible dans le Header.
- `src/components/PaymentSuccessPage.jsx` — Page de confirmation post-paiement avec animation.

**Routing Vercel :** `/payment-success` et `/payment-cancel` redirigent vers `index.html` (SPA).

### Conséquences
- **Avantage** : Aucune donnée de carte ne transite par nos serveurs (Stripe Checkout hébergé).
- **Avantage** : Le Customer Portal Stripe gère automatiquement les factures PDF, mises à jour CB, et annulations.
- **Avantage** : Les webhooks garantissent la cohérence de l'état même si le client ferme le navigateur avant la redirection.
- **Règle** : Toute modification du pricing (ajout de plan, changement de tarif) doit créer un nouveau `Price` dans Stripe (jamais modifier un Price existant) et mettre à jour `STRIPE_PRICE_ID_*` dans `.env.local` + Vercel.
- **Règle** : Le `SUPABASE_SERVICE_ROLE_KEY` doit être utilisé dans les API routes webhook (et non la clé anon) pour mettre à jour la table `tenants`.

---

## ADR 011 : Optimisation Avancée du Pipeline RAG (Dé-truncation, Overlap Sémantique & Enrichissement Métadonnées)
**Date:** 13 Août 2026
**Statut:** Accepté

### Contexte
Bien que l'ADR-008 et l'ADR-009 aient posé les bases du FTS bilingue et des Embeddings Jina v3 (768d), le pipeline RAG souffrait encore de 3 limites majeures :
1. **Troncature arbitraire** : `start-scan.js` et `update-document.js` appliquaient `chunks.slice(0, 20)`, ce qui abandonnait le contenu au-delà de 20 chunks (~16 000 caractères).
2. **Coupure du contexte** : La découpe par paragraphes ne préservait aucun chevauchement, risquant de fragmenter une idée ou une liste à la frontière de deux chunks.
3. **Absence de métadonnées de source** : Les chunks étaient stockés nus, sans que l'embedding ou le modèle LLM ne sache de quelle URL provient le texte.

### Décision
1. **Suppression de la limite de 20 chunks** : Indexation intégrale des pages web.
2. **Génération d'embeddings par lots (Batching pour Free Tier Jina)** : Traitement des embeddings par paquets de 20 chunks (`BATCH_SIZE = 20`) avec une temporisation de 200 ms entre les lots pour respecter strictement les quotas et limites de débit du Tier Gratuit Jina AI.
3. **Overlap Sémantique** : Injection automatique des 20 derniers mots du chunk précédent au début du chunk suivant (`... [overlap]\n\n[nouveau texte]`) dans `cleanAndChunk`.
4. **Enrichissement des Métadonnées** : Préfixe explicite `[Source URL: {targetUrl}]\n` ajouté directement à chaque chunk avant son embedding et stockage vectoriel.
5. **Augmentation de la fenêtre de contexte dans `chat.js`** : Augmentation du nombre de chunks extraits (`match_count` porté de 5 à 10) lors de la recherche hybride `match_documents_hybrid` pour fournir un contexte plus riche et exhaustif au LLM.

### Conséquences
- **Avantage** : Couverture complète des pages volumineuses sans perte de données.
- **Avantage** : Amélioration sensible du recall vectoriel grâce aux métadonnées d'URL et à l'overlap sémantique.
- **Avantage** : Respect garanti des limites d'API pour le tier gratuit de Jina Embeddings.
- **Règle** : Toute mise à jour de la logique de chunking ou de batching doit impérativement être répercutée de façon identique dans `start-scan.js` et `update-document.js`.

---

## ADR 012 : Flux d'Onboarding Synchrone, Statuts de Pages & Re-crawl avec Nettoyage DB
**Date:** 13 Août 2026
**Statut:** Accepté

### Contexte
L'expérience d'onboarding initiale comportait un écran d'attente bloquant pendant le crawl en arrière-plan, ce qui laissait l'utilisateur dans l'ignorance de l'avancement. De plus, les boutons d'activation individuelle de page et le re-scan complet avec suppression des anciens morceaux de documents n'étaient pas synchronisés de manière transparente.

### Décision
1. **Transition Immédiate au Dashboard** : Soumettre une URL crée le site et affiche immédiatement le Tableau de Bord client avec le tiroir *Gérer la base de connaissances* ouvert.
2. **Crawl Synchrone avec Progression Textuelle** : L'exploration (`/api/crawl-site`) et l'indexation (`/api/start-scan`) s'exécutent séquentiellement en direct sous les yeux de l'utilisateur avec des messages de statut explicites (`Indexation page X/N : [URL]`).
3. **Verrouillage du Bouton Aperçu** : Le bouton "Aperçu Plein Écran & Test Live" est désactivé tant que `isCrawling` est actif (`opacity-70 cursor-not-allowed`) pour éviter de tester un bot partiellement indexé.
4. **Statuts de Pages Granulaires** : Le tableau des pages affiche pour chaque ligne l'un des trois statuts :
   - `loading` : Spinner animé + badge ambre (En cours d'indexation)
   - `loaded` : Badge vert avec coche (Indexé)
   - `disabled` : Badge gris (Ignoré / Désactivé)
5. **Actions par Page (Activer / Désactiver)** : Bouton dédié permettant de désactiver une page (suppression des chunks dans Supabase) ou de la réactiver (déclenchement du scan et passage en `loading` -> `loaded`).
6. **Bouton Re-scanner / Rafraîchir avec Purge DB** : Le bouton de re-scan effectue d'abord un nettoyage complet des anciens chunks de la table Supabase (`DELETE FROM documents WHERE site_id = ...`) avant de relancer le crawl synchrone complet.

### Conséquences
- **Avantage** : Transparence totale pour l'utilisateur qui suit l'indexation en temps réel.
- **Avantage** : Prévention des erreurs en empêchant l'ouverture de la démo pendant le crawl.
- **Avantage** : Nettoyage propre des données obsolètes lors d'un re-crawl d'un site.

---

## ADR 013 : Intégration du Résumé de Site Web (Site Summary RAG Context)
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Lorsqu'un visiteur pose une question générale sur une entreprise (ex: "Que fait votre entreprise ?", "Quels sont vos domaines d'expertise ?"), le chatbot devait précédemment déclencher une recherche RAG par chunks qui pouvait retourner des fragments isolés au lieu d'une vue d'ensemble cohérente du site.

### Décision
1. **Extraction & Génération AI** : Création du module `api/generate-summary.js` et de la fonction `generateWebsiteSummary` (`api/lib/llm.js`). Le système extrait le contenu brut de la page d'accueil ou des chunks du site et génère un résumé structuré et concis par le LLM.
2. **Stockage Supabase Dedicated** : Création de la table `site_summaries` (`supabase/migrations/20260814000001_site_summaries.sql`) avec contrainte unique `(tenant_id, site_id)` et Row Level Security (RLS).
3. **Auto-génération lors de l'ingestion** : `api/start-scan.js` déclenche automatiquement la génération et l'upsert du résumé lors de l'indexation de la page d'accueil.
4. **Injection dans le Prompt système (`api/chat.js`)** : Le résumé est extrait au début de chaque session de chat et directement injecté dans le prompt système du bot.
5. **Robustesse et Fallback** : Si aucun résumé n'est présent (ou en cas d'erreur), le chatbot conserve son comportement RAG classique sans aucune interruption.

### Conséquences
- **Avantage** : Réponses immédiates et exhaustives aux questions d'ensemble sur l'entreprise dès le premier message sans coût d'outil supplémentaire.
- **Avantage** : Amélioration drastique de la qualité perçue des réponses initiales du chatbot.
- **Règle** : Toute mise à jour de la table `site_summaries` doit s'effectuer via des requêtes SQL/Supabase brutes (conformément à l'ADR-004).

---

## ADR 014 : Post-traitement Atomique des Statuts de Crawl & Désactivation des Pages Vides
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
La détection des pages vides (`empty`) ou protégées (`protected`) et la désactivation des cases à cocher s'exécutaient de manière itérative au sein de la boucle de scan. Cela entraînait des clignotements d'interface, des désactivations prématurées et des conflits d'état pendant que le crawl était encore en cours.

### Décision
1. **Séparation Stricte entre Scan et Post-Traitement** : Durant la phase de scan, toutes les pages découvertes restent affichées avec le statut `loading` et toutes les URL demeurent sélectionnées dans `selectedUrls`.
2. **Exécution du Marquage uniquement APRÈS la Fin du Crawl** : Une fois la boucle de scan de toutes les pages 100% terminée, une passe de post-traitement vérifie le nombre réel de morceaux de document enregistrés dans Supabase (`documents`).
3. **Mise à Jour Atomique** : Les statuts finaux (`loaded`, `empty`, `protected`) et les désactivations de sélection sont appliqués en une seule mise à jour d'état atomique (`setDiscoveredPages` et `setSelectedUrls`).

### Conséquences
- **Avantage** : Élimination complète des bugs d'affichage et des clignotements de statut durant le crawl.
- **Avantage** : Garantie que les pages ne sont désactivées que si et seulement si l'indexation globale du site est totalement achevée et vérifiée en base de données.

---

## ADR 015 : Bouton d'Ouverture de l'Aperçu dans un Nouvel Onglet
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Lors de l'utilisation de la modale d'aperçu plein écran (`showPreviewModal`), l'utilisateur souhaitait avoir la possibilité d'ouvrir rapidement le site prévisualisé dans un nouvel onglet du navigateur.

### Décision
Ajout d'un bouton "Ouvrir dans un nouvel onglet" dans la barre de contrôle supérieure de la modale d'aperçu (`ClientOnboarding.jsx`). Le bouton s'appuie sur une balise `<a>` avec `target="_blank"`, `rel="noopener noreferrer"`, et comporte l'icône `ExternalLink` issue de `lucide-react`.

### Conséquences
- **Avantage** : Accès direct en 1-clic au site web de destination dans un nouvel onglet sans fermer la session de test ou le tableau de bord d'administration.

---

## ADR 016 : Parallélisation de l'Ingestion (Batching Client-Side)
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
L'ingestion des pages web découvertes (crawling) s'effectuait de manière séquentielle (une page à la fois) dans `ClientOnboarding.jsx`. Cela rendait le processus très lent pour les sites contenant beaucoup de pages, car chaque page devait attendre que la précédente termine son scan (`/api/start-scan`) avant de commencer.

- Mise à jour de `match_documents_hybrid` pour supporter les deux langues
- Utilisation de `plainto_tsquery` (OR souple) plutôt que `websearch_to_tsquery` (AND strict)

**`chat.js` :** Remplacement du `textSearch()` mono-langue par la RPC `search_documents_fts` avec fallback automatique sur l'ancien `textSearch` si la migration n'est pas encore déployée.

**Ré-ingéstion :** Script `reingest-delafontaine.mjs` — 12 pages ingérées via Jina Reader, résultat : 23 chunks propres sur 9 URLs (vs 13 chunks pollus sur 1 URL).

**Tests :** Script `test-rag-search.js` — 17 cas de test couvrant :
- Groupe A (10) : happy path — contenu métier confirmé
- Groupe B (2) : bilingue FR→EN (tests informatifs, limite FTS attendue)
- Groupe C (3) : négatifs stricts (hors-sujet, RGPD, prix absents)
- Groupe D (2) : qualité — absence de bruit, pertinence du ranking

Résultat final : **17/17 tests passent (100%)**.

### Conséquences
- **Avantage** : Toute future ingéstion (nouvel onboarding client) bénéficie automatiquement du filtre de bruit et du FTS bilingue.
- **Avantage** : Le bot peut répondre correctement aux questions en anglais sur des sites anglophones.
- **Limite restante** : Les requêtes françaises sur du contenu anglais ne sont pas encore couvertes par FTS (nécessite des embeddings sémantiques — étape future).
- **Règle** : Tout changement à la logique de chunking DOIT être appliqué simultanément dans `start-scan.js` ET `update-document.js` pour garder la cohérence.

---

## ADR 009 : Intégration des Embeddings Sémantiques Multilingues Jina AI v3 (768d)
**Date:** 10 Août 2026
**Statut:** Accepté

### Contexte
Bien que le FTS bilingue (ADR-008) ait résolu les requêtes exactes en français et en anglais, il présentait deux limites fondamentales :
1. **Match cross-langues** : Une question posée en français (`"entreprise familiale"`) sur un site 100% anglais (`delafontaine.ca`) retournait 0 résultat FTS.
2. **Recherche conceptuelle** : Les synonymes et requêtes paraphrasées sans mots-clés exacts n'étaient pas capturés.

### Décision

1. **Modèle d'Embeddings** : Adoption de **`jina-embeddings-v3`** (Jina AI) configuré à **768 dimensions**, qui matche exactement la colonne Supabase `embedding vector(768)` sans modification de schéma SQL.
2. **Task-Specific Embeddings** :
   - `retrieval.passage` pour le batch chunking lors de l'ingestion (`start-scan.js`, `update-document.js`, `reingest-delafontaine.mjs`).
   - `retrieval.query` pour les requêtes de recherche utilisateur dans `api/chat.js`.
3. **Recherche Hybride RRF (Reciprocal Rank Fusion)** : L'API `chat.js` génère l'embedding de la requête utilisateur et appelle la RPC `match_documents_hybrid` qui combine :
   - Distance cosinus sémantique (`embedding <=> query_embedding`)
   - Rank FTS bilingue (`fts` FR + `fts_en` EN)
   - Fallback gracieux sur FTS bilingue pur ou `textSearch` si la clé ou le service d'embeddings est indisponible.
4. **Validation par Suite de Tests** : 17/17 tests RAG valides avec **100% de réussite** sur `match_documents_hybrid (Semantic Vector 768d + FTS)`. Les requêtes cross-langues FR → EN (`"entreprise familiale"`, `"portes acier coupe-feu"`) retournent les bons chunks pertinents.

### Conséquences
- **Avantage** : Recherche RAG sémantique multilingue robuste supportant le français, l'anglais, les synonymes et les paraphrases.
- **Avantage** : Résilience maximale avec fallback automatique sur FTS bilingue si l'API d'embedding échoue.
- **Sécurité/Performance** : Batching d'embeddings lors de l'ingestion (1 seul appel HTTP par page).

---

## ADR 010 : Intégration du Paiement via Stripe (Subscriptions + Billing Portal)
**Date:** 11 Août 2026
**Statut:** Accepté

### Contexte
La plateforme avait une page `Pricing.jsx` avec des plans (Starter 29$/mois, Pro 99$/mois, Enterprise sur mesure) mais aucun mécanisme de paiement réel. L'objectif est de rendre la plateforme payante en utilisant un fournisseur de paiement standard.

### Décision
Nous adoptons **Stripe** comme fournisseur de paiement unique, avec les composants suivants :

1. **Stripe Checkout** (mode `subscription`) — Page de paiement hébergée par Stripe, sans PCI-DSS côté client.
2. **Stripe Billing Portal** — Portail client Stripe pour gérer les abonnements (annulation, changement de CB, factures).
3. **Stripe Webhooks** — Synchronisation asynchrone de l'état d'abonnement dans Supabase (`tenants.plan`, `plan_status`, `stripe_subscription_id`).

**Fichiers créés :**
- `api/create-checkout-session.js` — Crée la session Checkout, attache/crée le Customer Stripe.
- `api/create-portal-session.js` — Crée la session Billing Portal.
- `api/stripe-webhook.js` — Traite `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`.
- `supabase/migrations/20260811000001_stripe_billing.sql` — Ajoute `stripe_subscription_id`, `plan_status`, `plan_expires_at` sur `tenants`.
- `src/components/PlanBadge.jsx` — Badge plan actuel visible dans le Header.
- `src/components/PaymentSuccessPage.jsx` — Page de confirmation post-paiement avec animation.

**Routing Vercel :** `/payment-success` et `/payment-cancel` redirigent vers `index.html` (SPA).

### Conséquences
- **Avantage** : Aucune donnée de carte ne transite par nos serveurs (Stripe Checkout hébergé).
- **Avantage** : Le Customer Portal Stripe gère automatiquement les factures PDF, mises à jour CB, et annulations.
- **Avantage** : Les webhooks garantissent la cohérence de l'état même si le client ferme le navigateur avant la redirection.
- **Règle** : Toute modification du pricing (ajout de plan, changement de tarif) doit créer un nouveau `Price` dans Stripe (jamais modifier un Price existant) et mettre à jour `STRIPE_PRICE_ID_*` dans `.env.local` + Vercel.
- **Règle** : Le `SUPABASE_SERVICE_ROLE_KEY` doit être utilisé dans les API routes webhook (et non la clé anon) pour mettre à jour la table `tenants`.

---

## ADR 011 : Optimisation Avancée du Pipeline RAG (Dé-truncation, Overlap Sémantique & Enrichissement Métadonnées)
**Date:** 13 Août 2026
**Statut:** Accepté

### Contexte
Bien que l'ADR-008 et l'ADR-009 aient posé les bases du FTS bilingue et des Embeddings Jina v3 (768d), le pipeline RAG souffrait encore de 3 limites majeures :
1. **Troncature arbitraire** : `start-scan.js` et `update-document.js` appliquaient `chunks.slice(0, 20)`, ce qui abandonnait le contenu au-delà de 20 chunks (~16 000 caractères).
2. **Coupure du contexte** : La découpe par paragraphes ne préservait aucun chevauchement, risquant de fragmenter une idée ou une liste à la frontière de deux chunks.
3. **Absence de métadonnées de source** : Les chunks étaient stockés nus, sans que l'embedding ou le modèle LLM ne sache de quelle URL provient le texte.

### Décision
1. **Suppression de la limite de 20 chunks** : Indexation intégrale des pages web.
2. **Génération d'embeddings par lots (Batching pour Free Tier Jina)** : Traitement des embeddings par paquets de 20 chunks (`BATCH_SIZE = 20`) avec une temporisation de 200 ms entre les lots pour respecter strictement les quotas et limites de débit du Tier Gratuit Jina AI.
3. **Overlap Sémantique** : Injection automatique des 20 derniers mots du chunk précédent au début du chunk suivant (`... [overlap]\n\n[nouveau texte]`) dans `cleanAndChunk`.
4. **Enrichissement des Métadonnées** : Préfixe explicite `[Source URL: {targetUrl}]\n` ajouté directement à chaque chunk avant son embedding et stockage vectoriel.
5. **Augmentation de la fenêtre de contexte dans `chat.js`** : Augmentation du nombre de chunks extraits (`match_count` porté de 5 à 10) lors de la recherche hybride `match_documents_hybrid` pour fournir un contexte plus riche et exhaustif au LLM.

### Conséquences
- **Avantage** : Couverture complète des pages volumineuses sans perte de données.
- **Avantage** : Amélioration sensible du recall vectoriel grâce aux métadonnées d'URL et à l'overlap sémantique.
- **Avantage** : Respect garanti des limites d'API pour le tier gratuit de Jina Embeddings.
- **Règle** : Toute mise à jour de la logique de chunking ou de batching doit impérativement être répercutée de façon identique dans `start-scan.js` et `update-document.js`.

---

## ADR 012 : Flux d'Onboarding Synchrone, Statuts de Pages & Re-crawl avec Nettoyage DB
**Date:** 13 Août 2026
**Statut:** Accepté

### Contexte
L'expérience d'onboarding initiale comportait un écran d'attente bloquant pendant le crawl en arrière-plan, ce qui laissait l'utilisateur dans l'ignorance de l'avancement. De plus, les boutons d'activation individuelle de page et le re-scan complet avec suppression des anciens morceaux de documents n'étaient pas synchronisés de manière transparente.

### Décision
1. **Transition Immédiate au Dashboard** : Soumettre une URL crée le site et affiche immédiatement le Tableau de Bord client avec le tiroir *Gérer la base de connaissances* ouvert.
2. **Crawl Synchrone avec Progression Textuelle** : L'exploration (`/api/crawl-site`) et l'indexation (`/api/start-scan`) s'exécutent séquentiellement en direct sous les yeux de l'utilisateur avec des messages de statut explicites (`Indexation page X/N : [URL]`).
3. **Verrouillage du Bouton Aperçu** : Le bouton "Aperçu Plein Écran & Test Live" est désactivé tant que `isCrawling` est actif (`opacity-70 cursor-not-allowed`) pour éviter de tester un bot partiellement indexé.
4. **Statuts de Pages Granulaires** : Le tableau des pages affiche pour chaque ligne l'un des trois statuts :
   - `loading` : Spinner animé + badge ambre (En cours d'indexation)
   - `loaded` : Badge vert avec coche (Indexé)
   - `disabled` : Badge gris (Ignoré / Désactivé)
5. **Actions par Page (Activer / Désactiver)** : Bouton dédié permettant de désactiver une page (suppression des chunks dans Supabase) ou de la réactiver (déclenchement du scan et passage en `loading` -> `loaded`).
6. **Bouton Re-scanner / Rafraîchir avec Purge DB** : Le bouton de re-scan effectue d'abord un nettoyage complet des anciens chunks de la table Supabase (`DELETE FROM documents WHERE site_id = ...`) avant de relancer le crawl synchrone complet.

### Conséquences
- **Avantage** : Transparence totale pour l'utilisateur qui suit l'indexation en temps réel.
- **Avantage** : Prévention des erreurs en empêchant l'ouverture de la démo pendant le crawl.
- **Avantage** : Nettoyage propre des données obsolètes lors d'un re-crawl d'un site.

---

## ADR 013 : Intégration du Résumé de Site Web (Site Summary RAG Context)
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Lorsqu'un visiteur pose une question générale sur une entreprise (ex: "Que fait votre entreprise ?", "Quels sont vos domaines d'expertise ?"), le chatbot devait précédemment déclencher une recherche RAG par chunks qui pouvait retourner des fragments isolés au lieu d'une vue d'ensemble cohérente du site.

### Décision
1. **Extraction & Génération AI** : Création du module `api/generate-summary.js` et de la fonction `generateWebsiteSummary` (`api/lib/llm.js`). Le système extrait le contenu brut de la page d'accueil ou des chunks du site et génère un résumé structuré et concis par le LLM.
2. **Stockage Supabase Dedicated** : Création de la table `site_summaries` (`supabase/migrations/20260814000001_site_summaries.sql`) avec contrainte unique `(tenant_id, site_id)` et Row Level Security (RLS).
3. **Auto-génération lors de l'ingestion** : `api/start-scan.js` déclenche automatiquement la génération et l'upsert du résumé lors de l'indexation de la page d'accueil.
4. **Injection dans le Prompt système (`api/chat.js`)** : Le résumé est extrait au début de chaque session de chat et directement injecté dans le prompt système du bot.
5. **Robustesse et Fallback** : Si aucun résumé n'est présent (ou en cas d'erreur), le chatbot conserve son comportement RAG classique sans aucune interruption.

### Conséquences
- **Avantage** : Réponses immédiates et exhaustives aux questions d'ensemble sur l'entreprise dès le premier message sans coût d'outil supplémentaire.
- **Avantage** : Amélioration drastique de la qualité perçue des réponses initiales du chatbot.
- **Règle** : Toute mise à jour de la table `site_summaries` doit s'effectuer via des requêtes SQL/Supabase brutes (conformément à l'ADR-004).

---

## ADR 014 : Post-traitement Atomique des Statuts de Crawl & Désactivation des Pages Vides
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
La détection des pages vides (`empty`) ou protégées (`protected`) et la désactivation des cases à cocher s'exécutaient de manière itérative au sein de la boucle de scan. Cela entraînait des clignotements d'interface, des désactivations prématurées et des conflits d'état pendant que le crawl était encore en cours.

### Décision
1. **Séparation Stricte entre Scan et Post-Traitement** : Durant la phase de scan, toutes les pages découvertes restent affichées avec le statut `loading` et toutes les URL demeurent sélectionnées dans `selectedUrls`.
2. **Exécution du Marquage uniquement APRÈS la Fin du Crawl** : Une fois la boucle de scan de toutes les pages 100% terminée, une passe de post-traitement vérifie le nombre réel de morceaux de document enregistrés dans Supabase (`documents`).
3. **Mise à Jour Atomique** : Les statuts finaux (`loaded`, `empty`, `protected`) et les désactivations de sélection sont appliqués en une seule mise à jour d'état atomique (`setDiscoveredPages` et `setSelectedUrls`).

### Conséquences
- **Avantage** : Élimination complète des bugs d'affichage et des clignotements de statut durant le crawl.
- **Avantage** : Garantie que les pages ne sont désactivées que si et seulement si l'indexation globale du site est totalement achevée et vérifiée en base de données.

---

## ADR 015 : Bouton d'Ouverture de l'Aperçu dans un Nouvel Onglet
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
Lors de l'utilisation de la modale d'aperçu plein écran (`showPreviewModal`), l'utilisateur souhaitait avoir la possibilité d'ouvrir rapidement le site prévisualisé dans un nouvel onglet du navigateur.

### Décision
Ajout d'un bouton "Ouvrir dans un nouvel onglet" dans la barre de contrôle supérieure de la modale d'aperçu (`ClientOnboarding.jsx`). Le bouton s'appuie sur une balise `<a>` avec `target="_blank"`, `rel="noopener noreferrer"`, et comporte l'icône `ExternalLink` issue de `lucide-react`.

### Conséquences
- **Avantage** : Accès direct en 1-clic au site web de destination dans un nouvel onglet sans fermer la session de test ou le tableau de bord d'administration.

---

## ADR 016 : Parallélisation de l'Ingestion (Batching Client-Side)
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
L'ingestion des pages web découvertes (crawling) s'effectuait de manière séquentielle (une page à la fois) dans `ClientOnboarding.jsx`. Cela rendait le processus très lent pour les sites contenant beaucoup de pages, car chaque page devait attendre que la précédente termine son scan (`/api/start-scan`) avant de commencer.

### Décision
1. **Batching Concurrent (Client-Side)** : Le scan des pages a été parallélisé dans `runSynchronousCrawlAndIndex` en utilisant `Promise.all` avec un niveau de concurrence (`CONCURRENCY = 5`).
2. **Gestion d'État Sécurisée** : Les mises à jour de l'état React (`setDiscoveredPages`, `setSelectedUrls`) utilisent des fonctions de mise à jour fonctionnelles (`prev => ...`) pour garantir qu'aucune donnée n'est perdue ou écrasée lors des retours de promesses concurrentes.

### Conséquences
- **Avantage** : Accélération massive du temps d'ingestion global du site web lors de l'onboarding.
- **Inconvénient** : Augmentation du taux de requêtes concurrentes vers notre API et vers Jina Reader (géré par notre limite de concurrence de 5).

---

## ADR 017 : Refonte du Prompt Système (Posture Service Client & Liens Directs)
**Date:** 14 Août 2026
**Statut:** Accepté

### Contexte
L'assistant IA manquait de consistance dans son rôle : il ne se positionnait pas toujours comme un véritable membre du service client, et pouvait inviter l'utilisateur à "consulter le site web" alors qu'il se trouve déjà dessus. Il fallait également s'assurer qu'il utilise le "nous" de façon stricte.

### Décision
Le `systemPrompt` dans `api/chat.js` a été entièrement revu pour :
1. Renforcer la posture d'**agent de service client** (intégration totale à l'équipe, utilisation exclusive de "nous").
2. Interdire formellement les phrases du type "consultez notre site web". S'il faut fournir une information, il la donne ou fournit le lien direct (URL).
3. Bannir le jargon IA ("contexte", "base de données") pour maintenir l'immersion.
4. Accentuer la priorité sur la capture de prospects dès qu'un intérêt est montré (si activé).
5. **Valorisation de la marque** : Consigne explicite de vendre poliment les services et de positionner l'entreprise comme premium, de manière consultative et non agressive.

### Conséquences
- **Avantage** : L'expérience utilisateur est nettement plus naturelle et professionnelle. Le bot agit comme un vrai employé.
- **Avantage** : Élimination des frictions UX (dire d'aller sur le site alors qu'on y est).

## ADR 029: Ajout du Plan Pro Appointment (80$/mois)
### Contexte
Le besoin de g�n�rer des conversions de haute valeur n�cessite de pouvoir lier l'IA � des syst�mes de r�servation (Google Calendar, Calendly) et de notifier le support client.
### D�cision
- Refonte de la page de tarification pour proposer le plan 'Pro Appointment & Support' � 80$.
- Ajout des champs \calendar_link\ et \support_email\ dans la base de donn�es (\sites\).
- Mise � jour du syst�me de prompt dynamique pour injecter le lien du calendrier dans les directives de l'agent.
- Ajout d'un outil agentique \send_support_email\ d�clench� uniquement pour les plans payants.
### Cons�quences
- Le chatbot passe de simple assistant FAQ � un agent de conversion qualifi� capable de booker des rendez-vous sans backend OAuth lourd (en relayant des liens Calendly param�trables par le client).
- L'injection d'outils est maintenant conditionn�e par le statut de l'abonnement Stripe du client.
