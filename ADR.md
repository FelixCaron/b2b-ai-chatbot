# B2B AI Chatbot - Architecture Decision Records (ADR)

---

## ADR 035 : Suppression Universelle et Résiliente de Sites Web (Dernier Site & Mode Prévisualisation)

**Date :** 2026-08-20

### Contexte
La suppression d'un site web pouvait échouer ou laisser l'interface dans un état incohérent dans deux cas d'usage :
1. **Dernier site du workspace** : Lorsque l'unique site restait dans la liste, la suppression laissait subsister des références (`localCreatedSite`) et ne réinitialisait pas le flow d'onboarding (`step: 'input'`), maintenant des panneaux orphelins. De plus, des clés étrangères dans des tables filles (`leads`, `scan_jobs`, `usage_counters`) pouvaient bloquer la suppression côté base de données si le CASCADE direct échouait.
2. **Mode Prévisualisation (Preview)** : Il n'existait pas de bouton de suppression direct dans la barre supérieure de la modale de prévisualisation, et la confirmation de suppression ne fermait pas proprement le modal plein écran.

### Décision
1. **Endpoint API Dédié (`/api/crawler/delete-site`)** :
   - Création d'une fonction serverless Edge exécutant une suppression en cascade sécurisée (via le client service role) sur toutes les tables filles (`documents`, `site_summaries`, `leads`, `scan_jobs`, `usage_counters`) avant de supprimer la ligne dans `sites`.
   - Fallback automatique côté client avec nettoyage de ces mêmes tables filles en cas d'indisponibilité réseau.
2. **Gestion Complète du Dernier Site** :
   - Réinitialisation complète de l'état du composant `Dashboard` (`localCreatedSite`, `selectedSiteId`, `discoveredPages`, `selectedUrls`, `detectedTheme`, et retour explicite à `step: 'input'`) lorsque le dernier site est supprimé.
   - Ajout d'un `useEffect` de synchronisation assurant que si la liste `sites` devient vide, l'interface retourne immédiatement à l'écran d'accueil d'onboarding.
3. **Support du Bouton Delete en Mode Prévisualisation** :
   - Ajout du bouton "Delete Website" avec confirmation modale directement dans la barre d'outils supérieure du mode prévisualisation.
   - Fermeture automatique et ordonnée de la modale de prévisualisation lors de la confirmation de la suppression.

### Conséquences
- La suppression d'un site web fonctionne désormais à 100% dans toutes les situations (qu'il s'agisse du dernier site, en mode normal ou en mode prévisualisation).
- Zéro état fantôme ou blocage d'interface.

---

## ADR 034 : Ouverture Automatique du Chatbot sur la page de Prévisualisation (preview.html)

**Date :** 2026-08-19

### Contexte
Dans l'interface administrateur (ClientOnboarding), la prévisualisation du chatbot sur le site du client simulait un panneau de chat toujours ouvert (overlay natif en React). Cependant, lorsque l'utilisateur cliquait sur "Ouvrir dans un nouvel onglet" (\preview.html\), le widget de chat réel (\widget.iife.js\) était injecté et apparaissait par défaut sous forme de "bulle" fermée (launcher) en bas à droite, donnant l'impression à l'utilisateur que le bot était "absent" de la page.
De plus, la couleur d'accentuation n'était pas passée correctement en paramètre d'URL lors de l'ouverture du nouvel onglet.

### Décision
1. Ajout de la capacité d'auto-ouverture (auto-open) au \widget.iife.js\. Le widget vérifie désormais l'attribut \data-auto-open="true"\ sur sa propre balise script pour forcer l'état initial ouvert (\isOpen = true\).
2. Ajout du paramètre d'URL \	heme_color\ dans \ClientOnboarding.jsx\ pour qu'il soit propagé à \preview.html\.
3. Modification de \preview.html\ pour inclure l'attribut \data-auto-open="true"\ et relayer correctement la couleur de thème lors de l'injection du script.

### Conséquences
- L'expérience dans le nouvel onglet (\preview.html\) est désormais identique à celle affichée dans la modale : le panneau du chatbot s'ouvre de lui-même dès le chargement de la page, rendant la prévisualisation immédiatement évidente.
- L'esthétique de la prévisualisation en plein écran correspond aux couleurs choisies dans le tableau de bord administrateur.

---
## ADR 033 : Masquage du Bot Copilot Admin en Mode Prévisualisation

**Date :** 2026-08-19

### Contexte
Le tableau de bord administrateur dispose de son propre chatbot (Copilot Admin) intégré via `apps/admin/index.html`. Lorsqu'un utilisateur ouvrait le mode "Prévisualisation" (Sandbox Preview) de son site, ce bot administrateur restait visible et superposé par-dessus la prévisualisation, créant un conflit visuel et interférant avec le test du bot du client.

### Décision
Ajout d'un `useEffect` dans `ClientOnboarding.jsx` qui écoute l'état `showPreviewModal`. Lorsque la modale de prévisualisation s'ouvre, on récupère l'élément racine du Copilot Admin (`#b2b-chatbot-host`) et on lui applique un `style.display = 'none'`. Lorsque la modale se ferme (ou que le composant est démonté), le style est réinitialisé.

### Conséquences
- L'expérience de prévisualisation est maintenant propre : un seul bot est affiché, celui correspondant au site client.
- Aucune interférence entre le bot du dashboard et les bots des clients.

---
## ADR 032 : Migration de Rattrapage Complète du Schéma Supabase

**Date :** 2026-08-19

### Contexte
Suite au bug `handleChatRequest is not defined` (ADR 031), l'investigation a révélé que l'erreur `42703` (colonne inexistante) était déclenchée parce que plusieurs migrations n'avaient jamais été appliquées à la base de données Supabase de production. Les colonnes manquantes identifiées :
- `sites.support_email`, `sites.calendar_link`, `sites.bot_goal`, `sites.bot_tone`, `sites.enable_lead_capture`, `sites.theme_primary_color`
- `documents.metadata` (JSONB, utilisé par le panneau admin pour afficher les titres de pages)
- `documents.fts_en` (FTS anglais pour la recherche bilingue)
- `leads.site_id`, `leads.summary`, `leads.metadata`
- RLS policies manquantes sur plusieurs tables (`site_summaries`, `usage_counters`, `scan_jobs`, etc.)
- RPC `search_documents_fts` peut-être absente si la migration FTS n'avait pas été appliquée

### Décision
Créer une migration de rattrapage unique, idempotente (`20260819000001_complete_schema_catchup.sql`) qui :
1. Recrée ou met à jour toutes les tables avec `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
2. Ajoute toutes les politiques RLS manquantes avec `DROP POLICY IF EXISTS` + `CREATE POLICY`
3. Recrée toutes les fonctions RPC avec `CREATE OR REPLACE FUNCTION`
4. Met à jour `consolidated_latest_migrations.sql` pour refléter l'état complet du schéma
Cette migration est safe à exécuter plusieurs fois sans effet de bord.

### Consequences
- La base de données est maintenant propre et cohérente avec le code de l'application.
- Le bot ne déclenchera plus l'erreur 42703 en conditions normales.
- **Action requise :** Exécuter `20260819000001_complete_schema_catchup.sql` (ou `consolidated_latest_migrations.sql`) dans l'éditeur SQL de Supabase Cloud pour mettre à jour la base de données de production.

---
## ADR 031 : Correction du Bug Critique `handleChatRequest is not defined` dans `api/chat.js`

**Date :** 2026-08-19

### Contexte
Le chatbot sur les sites clients retournait une erreur `handleChatRequest is not defined`. Cette erreur se produisait lorsque la requete Supabase de lookup du site echouait avec le code `42703` (colonne inexistante dans le schema DB). Le code appelait alors `handleChatRequest(...)` une fonction qui n'a jamais ete definie dans le fichier, vraisemblablement un artefact d'une refactorisation incomplete.

### Decision
Restructurer la logique de lookup du site dans `api/chat.js` pour eliminer tout appel a `handleChatRequest`. La nouvelle logique utilise un bloc `let site = null` avec une gestion inline :
1. Tentative de la requete complete (avec toutes les colonnes optionnelles).
2. En cas d'erreur 42703, execution d'une requete de repli sur les colonnes de base (id, tenant_id, domain), puis injection de valeurs par defaut securisees pour les colonnes manquantes.
3. L'execution continue alors inline sans appel a aucune fonction externe.

### Consequences
- Le bot ne plante plus lors d'une erreur de schema DB (42703).
- En cas de colonnes manquantes, le bot fonctionne en mode degrade avec des valeurs par defaut sures plutot que de crasher.
- A surveiller : si l'erreur 42703 persiste en production, une migration Supabase est manquante.

---

### Contexte
Le projet contenait plusieurs implÃƒÂ©mentations "maison" fastidieuses et potentiellement fragiles (ou peu sÃƒÂ©curisÃƒÂ©es) dans le widget client Vanilla JS :
- Un parseur Markdown `apps/widget/src/markdown.js` basÃƒÂ© sur des Regex basiques qui prÃƒÂ©sentaient des failles de style sur certains sauts de lignes ou combinaisons de listes.
- Un gestionnaire de streaming SSE (`apps/widget/src/chat.js`) qui fractionnait manuellement le tampon de texte reÃƒÂ§u via `TextDecoder` (risque de coupure au milieu d'un ÃƒÂ©vÃƒÂ©nement `\n\n`).

### DÃƒÂ©cision
1. **Markdown & SÃƒÂ©curitÃƒÂ©** : Suppression du parseur Regex "maison" au profit de la bibliothÃƒÂ¨que `marked` (robuste et standardisÃƒÂ©e), couplÃƒÂ©e ÃƒÂ  `dompurify` pour garantir une sanÃƒÂ©tisation XSS stricte avant injection HTML.
2. **Streaming SSE** : Remplacement de la boucle `reader.read()` manuelle par `@microsoft/fetch-event-source`, qui gÃƒÂ¨re nativement le standard *Server-Sent Events* et prÃƒÂ©vient les erreurs de dÃƒÂ©coupage de flux rÃƒÂ©seau.
3. **Styles CSS** : Nettoyage de `widget.css` pour cibler les balises standards (`p`, `ul`, `a`, `code`) dans `.b2b-msg` plutÃƒÂ´t que des classes CSS gÃƒÂ©nÃƒÂ©rÃƒÂ©es artificiellement (`.b2b-link`, `.b2b-p`).

### ConsÃƒÂ©quences
- Code source drastiquement simplifiÃƒÂ©, plus fiable et sÃƒÂ©curisÃƒÂ©.
- Taille du widget trÃƒÂ¨s lÃƒÂ©gÃƒÂ¨rement augmentÃƒÂ©e (86 Ko), mais un fonctionnement sans failles.

---

## ADR 027 : Support IntÃƒÂ©gral du Markdown (Widget Vanilla JS, Sandbox Admin et Prompt SystÃƒÂ¨me)
**Date:** 16 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Les rÃƒÂ©ponses de l'assistant contenaient de la syntaxe Markdown (mots en gras `**`, listes ÃƒÂ  puces `-`, liens cliquables `[texte](url)`, blocs de code) qui s'affichaient sous forme de texte brut avec des astÃƒÂ©risques et crochets dans le widget embarquÃƒÂ© client. De plus, le prompt systÃƒÂ¨me nÃƒÂ©cessitait des directives explicites pour structurer naturellement les rÃƒÂ©ponses avec des paragraphes aÃƒÂ©rÃƒÂ©s et des listes lisibles.

### DÃƒÂ©cision
1. **Parseur Markdown SÃƒÂ©curisÃƒÂ© & LÃƒÂ©ger dans le Widget Client (`apps/widget/src/markdown.js`)** :
   - Sanitization automatique contre les injections XSS.
   - Parsing en temps rÃƒÂ©el des ÃƒÂ©lÃƒÂ©ments Markdown : gras (`**`), italique (`*`), titres (`###`), liens cliquables (`[texte](url)` ouvrant en `target="_blank"` avec icÃƒÂ´ne Ã¢â€ â€”), listes ÃƒÂ  puces (`- ` / `* `) et listes numÃƒÂ©rotÃƒÂ©es (`1. `), code inline (`` `code` ``) et blocs de code (```` ```code``` ````), citations (`> `), paragraphes et sauts de ligne.
   - Rendu fluide durant le streaming (`onChunk`) et lors des messages finaux.
2. **Typographie et Styles CSS DÃƒÂ©diÃƒÂ©s (`apps/widget/src/widget.css`)** :
   - Styles dÃƒÂ©diÃƒÂ©s pour les paragraphes (`.b2b-p`), liens avec soulignement contrastÃƒÂ© (`.b2b-link`), listes indentÃƒÂ©es (`.b2b-list`), blocs de code sombres (`.b2b-code-block`) et titres hiÃƒÂ©rarchisÃƒÂ©s.
3. **Rendu PersonnalisÃƒÂ© dans l'AperÃƒÂ§u Admin (`ClientOnboarding.jsx`)** :
   - Configuration de `ReactMarkdown` avec des composants sur mesure pour styliser les liens `<a>`, le texte en gras `<strong>`, les listes `<ul>`/`<ol>` et les balises `<code>`.
4. **Directives de Formatage dans le Prompt SystÃƒÂ¨me (`api/chat.js`)** :
   - Instruction formelle donnÃƒÂ©e au LLM d'utiliser un Markdown soignÃƒÂ©, de mettre en valeur les termes clÃƒÂ©s en gras, d'ÃƒÂ©numÃƒÂ©rer les choix sous forme de listes ÃƒÂ  puces, de fournir des liens cliquables et de rÃƒÂ©diger des paragraphes concis.

### ConsÃƒÂ©quences
- ExpÃƒÂ©rience de lecture professionnelle, moderne et fluide tant sur le widget public que dans la console d'administration.
- PrÃƒÂ©sentation claire des listes de services, garanties, tarifs et liens externes.

---

## ADR 026 : Contournement Universel des Blocages d'Incrustation Iframe (`X-Frame-Options` / CSP) & SchÃƒÂ©ma Supabase ConsolidÃƒÂ©
**Date:** 16 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
1. De nombreux sites web clients intÃƒÂ¨grent des en-tÃƒÂªtes HTTP de sÃƒÂ©curitÃƒÂ© stricts (`X-Frame-Options: SAMEORIGIN` ou `DENY`, `Content-Security-Policy: frame-ancestors 'self'`) qui bloquent leur affichage au sein d'une balise `<iframe>` lors de la prÃƒÂ©visualisation dans `preview.html`.
2. La base de donnÃƒÂ©es Supabase Cloud prÃƒÂ©sentait un dÃƒÂ©calage par rapport aux rÃƒÂ©centes fonctionnalitÃƒÂ©s (colonnes de souscription Stripe sur `tenants`, tables `site_summaries`, `usage_counters` et `scan_jobs`).

### DÃƒÂ©cision
1. **Endpoint Proxy Anti-Frame-Blocker (`/api/preview-proxy`)** :
   - CrÃƒÂ©ation de `api/preview-proxy.js` qui rÃƒÂ©cupÃƒÂ¨re le HTML du site distant cÃƒÂ´tÃƒÂ© serveur.
   - Suppression systÃƒÂ©matique des en-tÃƒÂªtes bloquants (`X-Frame-Options`, `Content-Security-Policy`).
   - Injection automatique de la balise `<base href="...">` afin que tous les scripts, feuilles de style CSS, polices et images relatifs se chargent sans aucune altÃƒÂ©ration visuelle.
   - Neutralisation des scripts JavaScript de dÃƒÂ©-cadrage ("frame-busters").
2. **Interface de PrÃƒÂ©visualisation Enrichie (`preview.html`)** :
   - Utilisation par dÃƒÂ©faut du mode Proxy Anti-Blocage avec indicateur d'ÃƒÂ©tat actif.
   - SÃƒÂ©lecteur de viewport responsive (Desktop 100%, Tablette 768px, Mobile 390px) avec bordures rÃƒÂ©alistes.
   - Boutons de rechargement rapide, d'ouverture directe et de bascule manuelle en cas de besoin.
3. **SchÃƒÂ©ma SQL Supabase ConsolidÃƒÂ©** :
   - Fichier de migration consolidÃƒÂ© `supabase/consolidated_latest_migrations.sql` regroupant l'ensemble des DDLs ÃƒÂ  jour (`tenants`, `leads`, `site_summaries`, `usage_counters`, `scan_jobs`).
   - Script de vÃƒÂ©rification automatisÃƒÂ© `scripts/check-supabase-status.js` pour auditer ÃƒÂ  tout moment la conformitÃƒÂ© des tables et fonctions RPC.

### ConsÃƒÂ©quences
- 100% des sites web clients peuvent ÃƒÂªtre prÃƒÂ©visualisÃƒÂ©s avec le chatbot superposÃƒÂ© sans aucun message d'erreur de blocage navigateur.
- Suivi clair et script prÃƒÂªt ÃƒÂ  l'emploi pour garantir l'intÃƒÂ©gritÃƒÂ© de la base de donnÃƒÂ©es Supabase Cloud.

---

## ADR 025 : IntÃƒÂ©gration de la Page de PrÃƒÂ©visualisation DÃƒÂ©diÃƒÂ©e (`preview.html`) et Assainissement de la CI GitHub Actions
**Date:** 16 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
1. L'action d'ouverture de l'aperÃƒÂ§u du site dans un nouvel onglet redirigeait directement vers le domaine brut externe sans injecter le chatbot d'assistance. Une page enveloppe dÃƒÂ©diÃƒÂ©e (`preview.html`) a ÃƒÂ©tÃƒÂ© introduite pour charger le site client dans une iframe tout en superposant le widget d'assistant en direct.
2. Un commit distant antÃƒÂ©rieur avait accidentellement ÃƒÂ©crasÃƒÂ© `ClientOnboarding.jsx` avec un extrait textuel de patch git au lieu d'appliquer la modification. Ce composant clÃƒÂ© devait ÃƒÂªtre restaurÃƒÂ© et mis ÃƒÂ  jour proprement.
3. Le workflow GitHub Actions initial (`deploy.yml`) exÃƒÂ©cutait des tests avec effets de bord sur la base de donnÃƒÂ©es de production et tentait des dÃƒÂ©ploiements CLI Vercel redondants nÃƒÂ©cessitant des secrets non configurÃƒÂ©s, gÃƒÂ©nÃƒÂ©rant des ÃƒÂ©checs d'exÃƒÂ©cution rÃƒÂ©currents.

### DÃƒÂ©cision
1. **Restauration et IntÃƒÂ©gration SÃƒÂ©curisÃƒÂ©e de `ClientOnboarding.jsx`** :
   - Restauration de l'intÃƒÂ©gralitÃƒÂ© du composant `ClientOnboarding.jsx`.
   - Mise ÃƒÂ  jour du bouton "Ouvrir dans un nouvel onglet" vers `/preview.html?domain=...&tenant_key=...&api_url=...` pour un aperÃƒÂ§u dynamique complet.
2. **Synchronisation du Bundle Widget** :
   - Mise ÃƒÂ  disposition de `widget.iife.js` dans les fichiers statiques de l'admin (`apps/admin/public/widget.iife.js`) pour garantir le chargement local et distant immÃƒÂ©diat dans `preview.html`.
3. **Nettoyage et Modernisation de la CI (`.github/workflows/ci.yml`)** :
   - Remplacement de `deploy.yml` par un pipeline `ci.yml` propre, rapide et sans effets de bord.
   - Ajout d'un mÃƒÂ©canisme d'annulation de concurrence (`concurrency: cancel-in-progress: true`) pour optimiser l'utilisation des runners GitHub.
   - Compilation et validation automatisÃƒÂ©es de tous les modules du monorepo (`@b2b-ai-chatbot/shared`, `@b2b-ai-chatbot/widget`, `@b2b-ai-chatbot/admin`).
   - Ajout d'un script de test unitaire rapide (`scripts/test-schemas.js`) validant les contrats Zod sans polluer la base de donnÃƒÂ©es.

### ConsÃƒÂ©quences
- PrÃƒÂ©visualisation live du chatbot sur n'importe quel site web client dans un onglet dÃƒÂ©diÃƒÂ©.
- Codebase saine et zÃƒÂ©ro rÃƒÂ©gression dans l'espace d'onboarding.
- Pipeline GitHub Actions 100% vert, propre et sans dÃƒÂ©pendances critiques fragiles.

---

## ADR 024 : Harmonisation du Moteur IA sur GPT Luna (`openai/gpt-5.6-luna`) pour Tous les Forfaits
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Pour garantir une expÃƒÂ©rience ultra rapide, homogÃƒÂ¨ne et de haute prÃƒÂ©cision ÃƒÂ  travers l'ensemble des fonctionnalitÃƒÂ©s et des forfaits de la plateforme, l'ensemble des flux de chat et d'agents doivent utiliser le modÃƒÂ¨le GPT Luna (`openai/gpt-5.6-luna`).

### DÃƒÂ©cision
1. **Routage UnifiÃƒÂ© vers `openai/gpt-5.6-luna`** :
   - Dans `api/chat.js`, tous les forfaits (Free, Basic, Pro, Enterprise) routent directement vers `openai/gpt-5.6-luna`.
   - Dans `api/lib/llm.js`, la constante par dÃƒÂ©faut `DEFAULT_OPENROUTER_MODEL` et les assistants d'extraction (leads, synthÃƒÂ¨ses) sont configurÃƒÂ©s sur `openai/gpt-5.6-luna`.
2. **Mise ÃƒÂ  Jour des Fiches Forfaits** :
   - Les cartes de prix et fonctionnalitÃƒÂ©s dans `Pricing.jsx` mentionnent l'accÃƒÂ©lÃƒÂ©ration GPT Luna sur toutes les offres.

### ConsÃƒÂ©quences
- Temps de rÃƒÂ©ponse rÃƒÂ©duit, streaming ultra rÃƒÂ©actif et excellente capacitÃƒÂ© d'extraction/raisonnement sur l'ensemble de l'application.

---

## ADR 023 : Modale Interactive de SÃƒÂ©lection de Pages pour les Grands Sites (ZÃƒÂ©ro Omission Silencieuse)
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lorsqu'un site web dÃƒÂ©passe la limite de pages d'un forfait (ex: plus de 500 pages dÃƒÂ©couvertes), le systÃƒÂ¨me ne doit en aucun cas ignorer ou tronquer des pages silencieusement. L'utilisateur doit recevoir un avertissement explicite et pouvoir choisir prÃƒÂ©cisÃƒÂ©ment les pages ÃƒÂ  indexer ou mettre ÃƒÂ  niveau son forfait.

### DÃƒÂ©cision
1. **ZÃƒÂ©ro Omission Silencieuse** :
   - Le crawler dÃƒÂ©couvre et liste 100% des URLs disponibles sans restriction initiale.
2. **Modale d'Avertissement & SÃƒÂ©lecteur Interactif (`showPageSelectionModal`)** :
   - Si le nombre total de pages dÃƒÂ©couvertes dÃƒÂ©passe le quota du plan, le processus de scan automatique se met en pause et ouvre une modale dÃƒÂ©diÃƒÂ©e.
   - PrÃƒÂ©-sÃƒÂ©lection intelligente des premiÃƒÂ¨res pages (`Top N`) avec possibilitÃƒÂ© de cocher/dÃƒÂ©cocher n'importe quelle page.
   - Barre de recherche en temps rÃƒÂ©el pour filtrer les pages par chemin ou titre.
   - Compteur de sÃƒÂ©lection dynamique (`X / Y pages`) bloquant le dÃƒÂ©passement avec explication claire.
   - Bouton d'action directe "Upgrade Plan Ã¢â€ â€™" pour lever toutes les limites.
   - Bouton de confirmation "Confirm & Index Selected Pages" pour lancer l'indexation de la sÃƒÂ©lection personnalisÃƒÂ©e.

### ConsÃƒÂ©quences
- Transparence totale pour les clients ayant de volumineux catalogues ou documentations.
- MaÃƒÂ®trise totale de la sÃƒÂ©lection de contenu indexÃƒÂ© dans la base vectorielle.

---

## ADR 022 : Hausse du Seuil de Blocage ÃƒÂ  500 Pages, DÃƒÂ©couverte Multi-Sitemaps & Pagination DB
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Le seuil de blocage et de notification de quotas devait ÃƒÂªtre assoupli pour ne dÃƒÂ©clencher aucun blocage en dessous de 500 pages. De plus, la dÃƒÂ©couverte des sous-sitemaps devait supporter jusqu'ÃƒÂ  50 flux parallÃƒÂ¨les et la rÃƒÂ©cupÃƒÂ©ration des pages indexÃƒÂ©es devait lever la limite par dÃƒÂ©faut de 1000 lignes de Supabase postgREST.

### DÃƒÂ©cision
1. **Seuil de 500 Pages pour les Forfaits Standards** :
   - Aucun avertissement ou blocage n'est dÃƒÂ©clenchÃƒÂ© tant que le site contient 500 pages ou moins.
   - Les forfaits Pro supportent jusqu'ÃƒÂ  2 000 pages et Enterprise jusqu'ÃƒÂ  9 999+ pages.
2. **Support de 50 Sous-Sitemaps en ParallÃƒÂ¨le** :
   - Extension de la dÃƒÂ©couverte `crawl-site.js` pour explorer jusqu'ÃƒÂ  50 sous-sitemaps simultanÃƒÂ©ment.
3. **Suppression du Plafond de Lignes Supabase (`.limit(10000)`)** :
   - Dans `fetchIndexedPages`, ajout d'un `.limit(10000)` explicite sur la requÃƒÂªte des documents pour ÃƒÂ©viter la troncature silencieuse ÃƒÂ  1000 chunks (qui pouvait limiter l'affichage ÃƒÂ  ~50 pages).

### ConsÃƒÂ©quences
- ZÃƒÂ©ro blocage pour tous les sites web contenant jusqu'ÃƒÂ  500 pages.
- Indexation et affichage garantis de l'intÃƒÂ©gralitÃƒÂ© des sections et sous-pages du site.

---

## ADR 021 : Apprentissage IntÃƒÂ©gral sans Limite ÃƒÂ  l'Onboarding & Avertissement de Quotas au DÃƒÂ©ploiement
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lors de la dÃƒÂ©couverte initiale d'un site web pendant l'onboarding, un seuil arbitraire de pages (ex: 15 pages) tronquait l'indexation de sites complets comme Delafontaine (~28 pages), dÃƒÂ©gradant l'expÃƒÂ©rience de test et de dÃƒÂ©monstration du bot. Le client doit pouvoir tester l'IA sur l'ensemble de son contenu sans restriction lors de l'onboarding, et n'ÃƒÂªtre soumis aux quotas que lors du dÃƒÂ©ploiement rÃƒÂ©el du widget sur son site web.

### DÃƒÂ©cision
1. **Suppression Totale de la Limite de Pages ÃƒÂ  l'Onboarding** :
   - Pendant le scan initial et les re-scans, 100% des pages dÃƒÂ©couvertes sont scannÃƒÂ©es, indexÃƒÂ©es et apprises sans aucun dÃƒÂ©coupage artificiel.
2. **Avertissement de Quota Contextuel au DÃƒÂ©ploiement** :
   - Lorsque l'utilisateur ouvre la modale d'intÃƒÂ©gration du widget (`showIntegrationModal`) :
     - Si le nombre de pages actives dÃƒÂ©passe le forfait (ex: > 15 pages sur Free ou > 50 pages sur Basic) :
       - Affichage d'un encart d'avertissement clair dÃƒÂ©taillant le dÃƒÂ©passement (`X / Y pages`).
       - Bouton d'action directe "Upgrade Plan Ã¢â€ â€™" pour passer au forfait supÃƒÂ©rieur.
       - Bouton d'action "Manage & Deactivate Pages" qui redirige vers le tableau de la base de connaissances pour dÃƒÂ©sactiver les pages superflues si le client souhaite rester sur son forfait actuel.

### ConsÃƒÂ©quences
- ExpÃƒÂ©rience d'onboarding complÃƒÂ¨te, valorisante et sans friction.
- Incitation naturelle ÃƒÂ  l'upgrade au moment clÃƒÂ© du dÃƒÂ©ploiement en production.

---

## ADR 020 : Suppression SÃƒÂ©curisÃƒÂ©e de Sites Web & Nettoyage en Cascade
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Les utilisateurs souhaitaient pouvoir supprimer un site web obsolÃƒÂ¨te ou erronÃƒÂ© directement depuis le tableau de bord sans devoir nettoyer la base de donnÃƒÂ©es manuellement.

### DÃƒÂ©cision
1. **Bouton de Suppression & Modale de Confirmation** :
   - Ajout d'un bouton de suppression rouge avec icÃƒÂ´ne corbeille (`Trash2`) dans la barre d'action du site actif.
   - Modale de confirmation explicite (`showDeleteConfirmModal`) pour prÃƒÂ©venir toute suppression accidentelle.
2. **Nettoyage en Cascade des DonnÃƒÂ©es** :
   - Suppression en cascade dans Supabase de tous les documents (`documents`), rÃƒÂ©sumÃƒÂ©s (`site_summaries`) et de la ligne du site (`sites`).
3. **Mise ÃƒÂ  Jour Dynamique de l'UI** :
   - Si d'autres sites existent, l'interface bascule automatiquement sur le site suivant sans rafraÃƒÂ®chissement forcÃƒÂ©.
   - Si le dernier site est supprimÃƒÂ©, l'interface revient proprement ÃƒÂ  l'ÃƒÂ©cran d'accueil d'onboarding.

### ConsÃƒÂ©quences
- Gestion du cycle de vie des sites web complÃƒÂ¨te et sÃƒÂ©curisÃƒÂ©e pour les clients et administrateurs.

---

## ADR 019 : Limites de Forfaits (Sites/Pages/ModÃƒÂ¨les LLM), Gestion Multi-Sites Non-Bloquante, Navigation Leads & Optimisation du Crawl/Streaming
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
1. L'application nÃƒÂ©cessitait une hiÃƒÂ©rarchisation claire des forfaits (Free, Basic, Pro, Enterprise) avec des quotas prÃƒÂ©cis de sites web et de pages indexables, et un routage dynamique vers des modÃƒÂ¨les lÃƒÂ©gers (Free/Basic) ou des modÃƒÂ¨les avancÃƒÂ©s de raisonnement (Pro/Enterprise).
2. L'ajout d'un second site rÃƒÂ©initialisait l'interface au lieu d'offrir une expÃƒÂ©rience multi-sites fluide.
3. La section des prospects capturÃƒÂ©s (Leads) n'ÃƒÂ©tait pas accessible si la liste ÃƒÂ©tait vide ou depuis le menu principal.
4. L'aperÃƒÂ§u du rÃƒÂ©sumÃƒÂ© IA prÃƒÂ©sentait des risques de faible contraste (texte blanc sur fond blanc selon les navigateurs).
5. La performance d'indexation devait ÃƒÂªtre accÃƒÂ©lÃƒÂ©rÃƒÂ©e et les appels d'outils techniques (tool calls) devaient ÃƒÂªtre masquÃƒÂ©s au profit d'un streaming fluide.

### DÃƒÂ©cision
1. **Tiering des Plans et ModÃƒÂ¨les IA DÃƒÂ©diÃƒÂ©s** :
   - **Free ($0)** : 1 site max, 15 pages max, modÃƒÂ¨le lÃƒÂ©ger `google/gemini-2.0-flash-001`.
   - **Basic ($45 CAD)** : 1 site max, 50 pages max, modÃƒÂ¨le rapide optimisÃƒÂ© `openai/gpt-4o-mini`.
   - **Pro ($129 CAD)** : Jusqu'ÃƒÂ  5 sites, 250 pages/site, modÃƒÂ¨le de raisonnement avancÃƒÂ© `openai/gpt-4o`.
   - **Enterprise (Custom)** : Sites et pages illimitÃƒÂ©s, modÃƒÂ¨le haute fidÃƒÂ©litÃƒÂ© `anthropic/claude-3.5-sonnet`.
2. **Navigation Principale et AccÃƒÂ¨s Permanent aux Leads** :
   - Ajout d'onglets de navigation en haut de page (`Dashboard`, `Leads`, `Plans`) dans le Header et le header invitÃƒÂ©.
   - La page Leads est toujours consultable (avec tableau de bord, export CSV et message d'accueil explicatif).
3. **Gestion Multi-Sites Non-Bloquante** :
   - Ajout d'une barre de sÃƒÂ©lection de site (pills/onglets) sur le tableau de bord lorsqu'un client possÃƒÂ¨de plusieurs sites.
   - Modale dÃƒÂ©diÃƒÂ©e non-bloquante `showAddSiteModal` pour ajouter un nouveau domaine avec contrÃƒÂ´le des quotas du forfait actif.
4. **Correction du Contraste de RÃƒÂ©sumÃƒÂ© IA & Ãƒâ€°diteur de Pages** :
   - Application explicite des styles de fond sombre (`#090d16`) et texte clair (`#f3f4f6`) sur tous les textareas.
5. **AccÃƒÂ©lÃƒÂ©ration du Pipeline de Crawl et Streaming Chat Ãƒâ€°purÃƒÂ©** :
   - DÃƒÂ©couverte des sitemaps en parallÃƒÂ¨le avec `Promise.allSettled` et timeout d'abandon de 2.5s.
   - Concurrence d'indexation des pages augmentÃƒÂ©e ÃƒÂ  10x.
   - Masquage intÃƒÂ©gral des blocs bruts de debug `tool_call` dans le widget et l'aperÃƒÂ§u, avec streaming direct du texte ÃƒÂ  8ms.

### ConsÃƒÂ©quences
- Architecture multi-sites robuste sans aucun verrouillage de l'interface.
- ExpÃƒÂ©rience de discussion ÃƒÂ©purÃƒÂ©e et naturelle pour les visiteurs finaux.
- Offre commerciale et quotas techniques parfaitement alignÃƒÂ©s sur le backend et le frontend.

---

## ADR 018 : Simplification de l'Espace Client, Modale de Progression d'Apprentissage & Localisation Anglaise
**Date:** 15 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Pour un nouvel utilisateur, l'espace d'administration prÃƒÂ©sentait trop d'options simultanÃƒÂ©ment (formulaires de prompt, boutons de tons, gestionnaire de base de connaissances volumineux), ce qui crÃƒÂ©ait de la confusion quant ÃƒÂ  l'action principale ÃƒÂ  effectuer ("OÃƒÂ¹ aller ? Que faire maintenant ?"). De plus, l'apprentissage du site web manquait de visibilitÃƒÂ© et l'ensemble de la plateforme devait ÃƒÂªtre traduit en anglais.

### DÃƒÂ©cision
1. **Modale DÃƒÂ©diÃƒÂ©e d'Apprentissage avec Barre de Progression** :
   - Affichage d'une fenÃƒÂªtre modale interactive (`showLearningModal`) dÃƒÂ¨s le lancement de l'onboarding ou d'un re-scan.
   - Barre de progression animÃƒÂ©e (0% ÃƒÂ  100%) avec ÃƒÂ©tapes visuelles dÃƒÂ©taillÃƒÂ©es (DÃƒÂ©couverte des pages du sitemap, Indexation vectorielle sÃƒÂ©mantique, GÃƒÂ©nÃƒÂ©ration du rÃƒÂ©sumÃƒÂ© d'entreprise par l'IA).
   - Ãƒâ€°cran de fÃƒÂ©licitation avec bouton d'action directe "Test My Bot Now Ã¢â€ â€™" ouvrant immÃƒÂ©diatement l'aperÃƒÂ§u live plein ÃƒÂ©cran.
2. **Clarification du Dashboard & Regroupement des Options Secondaires** :
   - Carte Hero ÃƒÂ©purÃƒÂ©e mettant en avant le statut de l'assistant (Actif & En Ligne), la clÃƒÂ© publique et les 3 actions clÃƒÂ©s (Test Live, IntÃƒÂ©gration widget, Re-scan).
   - Guide d'onboarding rapide en 3 ÃƒÂ©tapes claires (1. Apprentissage IA validÃƒÂ© -> 2. Test sandbox en direct -> 3. IntÃƒÂ©gration du script).
   - Section accordÃƒÂ©on / dÃƒÂ©roulante "Advanced Settings & Knowledge Base" masquant par dÃƒÂ©faut les options secondaires (Couleur du widget, Capture de prospects, Objectif, Ton de voix, Ãƒâ€°diteur de rÃƒÂ©sumÃƒÂ©, Tableau de gestion des URLs).
3. **Traduction IntÃƒÂ©grale en Anglais** :
   - Traduction complÃƒÂ¨te de l'interface d'administration (Header, Onboarding, Modales, Table de prospects, Pricing, Ãƒâ€°cran de succÃƒÂ¨s Stripe) et du widget embarquÃƒÂ© (salutation par dÃƒÂ©faut, statuts d'outils, formulaires de secours).

### ConsÃƒÂ©quences
- ExpÃƒÂ©rience d'onboarding fluide, guidÃƒÂ©e et engageante pour tout nouvel arrivant.
- Tableau de bord ultra ÃƒÂ©purÃƒÂ© tout en conservant l'accÃƒÂ¨s direct aux rÃƒÂ©glages avancÃƒÂ©s via l'accordÃƒÂ©on.
- Plateforme 100% bilingue prÃƒÂªte pour les marchÃƒÂ©s anglophones et internationaux.

---

## ADR 008 : Interdiction des Salutations RÃƒÂ©pÃƒÂ©titives & Fallback de RÃƒÂ©sumÃƒÂ© d'Entreprise
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lorsqu'un utilisateur posait une question gÃƒÂ©nÃƒÂ©rale dÃƒÂ¨s le dÃƒÂ©but ("que faites vous ?"), le chatbot rÃƒÂ©pondait en rÃƒÂ©pÃƒÂ©tant une formule gÃƒÂ©nÃƒÂ©rique de prÃƒÂ©sentation de lui-mÃƒÂªme ("Bonjour, je suis l'assistant virtuel..."), crÃƒÂ©ant une impression de "double/triple message d'intro". De plus, si la table `site_summaries` n'ÃƒÂ©tait pas encore peuplÃƒÂ©e pour un site, le prompt systÃƒÂ¨me n'avait aucun rÃƒÂ©sumÃƒÂ© de l'entreprise sous la main.

### DÃƒÂ©cision
1. **Interdiction Formelle des Salutations RÃƒÂ©pÃƒÂ©titives** : Le widget affiche dÃƒÂ©jÃƒÂ  un message d'accueil initial au visiteur. L'IA a dÃƒÂ©sormais l'ordre strict de rÃƒÂ©pondre **directement et immÃƒÂ©diatement** ÃƒÂ  la question posÃƒÂ©e sans rÃƒÂ©utiliser de formules d'introduction ("Bonjour, je suis l'assistant...").
2. **Fallback Automatique sur les Documents d'Origine** : Si aucun rÃƒÂ©sumÃƒÂ© IA explicite n'existe encore dans `site_summaries`, l'API extrait automatiquement les premiers documents indexÃƒÂ©s du client pour alimenter le rÃƒÂ©sumÃƒÂ© d'entreprise du systÃƒÂ¨me prompt.
3. **RÃƒÂ©ponse Obligatoire aux Questions d'ActivitÃƒÂ©** : Ãƒâ‚¬ la question "que faites-vous ?", l'IA doit utiliser le rÃƒÂ©sumÃƒÂ© d'entreprise pour lister directement les vraies prestations au lieu de rÃƒÂ©pÃƒÂ©ter une politesse vide.

### ConsÃƒÂ©quences
- Suppression intÃƒÂ©grale des boucles de messages d'intro.
- L'IA prÃƒÂ©sente instantanÃƒÂ©ment les vrais produits/services du client dÃƒÂ¨s la premiÃƒÂ¨re question gÃƒÂ©nÃƒÂ©rale.

---

## ADR 007 : Directives Anti-Hallucination Strictes, Contexte Temporel et Suppression des Modes de Test Mock
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Le chatbot pouvait parfois gÃƒÂ©nÃƒÂ©rer des hallucinations sur les numÃƒÂ©ros de tÃƒÂ©lÃƒÂ©phone (ex: `[numÃƒÂ©ro de tÃƒÂ©lÃƒÂ©phone]`), inventer des heures d'ouverture gÃƒÂ©nÃƒÂ©riques (9h ÃƒÂ  18h) ou prendre une identitÃƒÂ© hardcodÃƒÂ©e (ex: "Portes Delafontaine") en raison d'un rÃƒÂ©sidu de `TEST_MODE` et d'une absence de rÃƒÂ¨gles explicites d'interdiction de placeholders et d'inventions de donnÃƒÂ©es de contact.

### DÃƒÂ©cision
1. **DÃƒÂ©sactivation intÃƒÂ©grale du TEST_MODE** : `TEST_MODE` est forcÃƒÂ© ÃƒÂ  `false` dans `api/lib/llm.js` afin d'empÃƒÂªcher toute injection de rÃƒÂ©ponses/donnÃƒÂ©es factices "Delafontaine".
2. **Injection du Contexte Temporel** : La date, le jour de la semaine et l'heure courante sont automatiquement injectÃƒÂ©s dans le `systemPrompt` pour que l'IA connaisse le moment prÃƒÂ©sent.
3. **Directives Anti-Hallucination Strictes** :
   - Interdiction absolue d'inventer des numÃƒÂ©ros de tÃƒÂ©lÃƒÂ©phone, des adresses, des horaires ou des tarifs.
   - Interdiction stricte d'utiliser des placeholders textuels (`[numÃƒÂ©ro de tÃƒÂ©lÃƒÂ©phone]`).
   - Obligation d'avouer l'absence d'information si la donnÃƒÂ©e n'est pas dans le RAG ou le rÃƒÂ©sumÃƒÂ© du site, et de proposer la capture de coordonnÃƒÂ©es (Leads).

### ConsÃƒÂ©quences
- Ãƒâ€°radication des rÃƒÂ©ponses avec placeholders ou fausses informations de contact.
- FiabilitÃƒÂ© et crÃƒÂ©dibilitÃƒÂ© maximales des assistants gÃƒÂ©nÃƒÂ©rÃƒÂ©s pour les clients B2B.

---

## ADR 001 : Suppression de l'upload de documents manuels
**Date:** 9 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
La plateforme est conÃƒÂ§ue pour permettre une intÃƒÂ©gration "en 1 clic" via l'URL du site web. Des questions se posaient sur la nÃƒÂ©cessitÃƒÂ© d'ajouter un systÃƒÂ¨me manuel d'upload de fichiers (PDF, Word) en guise de repli lorsque le scraping d'URL ÃƒÂ©choue.

### DÃƒÂ©cision
Nous **ne dÃƒÂ©velopperons pas** de fonctionnalitÃƒÂ© d'upload manuel de documents dans l'interface utilisateur. En cas d'erreur de scraping, le client est invitÃƒÂ© ÃƒÂ  nous contacter, et nous gÃƒÂ¨rerons le scraping manuellement de notre cÃƒÂ´tÃƒÂ©. 

### ConsÃƒÂ©quences
- **Avantage** : L'expÃƒÂ©rience utilisateur (UX) reste extrÃƒÂªmement simple, ÃƒÂ©purÃƒÂ©e et sans friction (Aha moment rapide). L'architecture reste lÃƒÂ©gÃƒÂ¨re et nous ÃƒÂ©vitons les coÃƒÂ»ts/gestion complexes du stockage de fichiers (S3/Supabase Storage) cÃƒÂ´tÃƒÂ© client.
- **InconvÃƒÂ©nient** : Les erreurs de scraping demandent une intervention manuelle (Support).

---

## ADR 002 : Design B2B "Corporate/Clean" pour l'Espace Client
**Date:** 9 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Le design initial du dashboard (Admin) utilisait un thÃƒÂ¨me "Dark Mode / NÃƒÂ©on" fortement inspirÃƒÂ© du Web3 (effets de `animate-glow`, flou intense, couleurs vives trÃƒÂ¨s contrastÃƒÂ©es). Le public cible B2B de nos dÃƒÂ©mos inclut des notaires, des cliniques dentaires, des garages, etc.

### DÃƒÂ©cision
Nous adoptons un design **Corporate et Ãƒâ€°purÃƒÂ©** pour le tableau de bord :
1. Suppression des statistiques non essentielles (`OverviewStats`) en haut du tableau de bord pour ÃƒÂ©viter l'encombrement visuel.
2. Suppression des effets de "Glow" et des halos lumineux intenses.
3. Utilisation de fonds sombres beaucoup plus neutres (`bg-dark-800`) et de bordures subtiles (`border-white/5`) au lieu d'effets Glassmorphism trÃƒÂ¨s marquÃƒÂ©s.

### ConsÃƒÂ©quences
- L'outil paraÃƒÂ®tra plus sÃƒÂ©rieux et fiable aux yeux de professionnels traditionnels (santÃƒÂ©, juridique).
- Le widget final encastrÃƒÂ© chez le client restera quant ÃƒÂ  lui 100% modifiable (couleur primaire) pour s'adapter ÃƒÂ  leur propre image de marque.
- **RÃƒÂ¨gle** : Toute future addition ÃƒÂ  l'interface d'administration doit respecter cette sobriÃƒÂ©tÃƒÂ©.

---

## ADR 003 : Transparence de l'Indexation et des Sources (RAG)
**Date:** 9 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'extraction et l'indexation de pages (Jina/Crawling) ÃƒÂ©taient des "boÃƒÂ®tes noires" : l'utilisateur cliquait et devait attendre sans trop savoir pourquoi, et le chatbot testÃƒÂ© ne citait pas ses sources.

### DÃƒÂ©cision
Pour bÃƒÂ¢tir la confiance :
1. Un statut granulaire textuel s'affiche dÃƒÂ©sormais sous la barre de recherche lors de l'onboarding ("Analyse de la charte graphique...", "Lecture et apprentissage...").
2. Dans le chat d'AperÃƒÂ§u (Test), lorsque l'outil `search_knowledge_base` est appelÃƒÂ©, l'interface affiche explicitement les **liens sources** lus par l'IA.
3. Un champ de recherche textuel a ÃƒÂ©tÃƒÂ© ajoutÃƒÂ© au-dessus du gestionnaire de base de connaissances pour naviguer facilement dans de gros sites.

### ConsÃƒÂ©quences
- Augmentation drastique de la confiance de l'utilisateur envers les rÃƒÂ©ponses du Bot.
- Une UX plus engageante durant les temps de chargement d'indexation.

---

## ADR 004 : Utilisation exclusive de requÃƒÂªtes SQL brutes (Pas d'ORM)
**Date:** DÃƒÂ©cision Initiale
**Statut:** AcceptÃƒÂ©

### Contexte
L'application doit ÃƒÂªtre dÃƒÂ©ployÃƒÂ©e sur Vercel Edge Functions pour une latence minimale, oÃƒÂ¹ certains ORMs (comme Prisma) peuvent ÃƒÂªtre lourds ou difficiles ÃƒÂ  configurer.

### DÃƒÂ©cision
Nous interdisons l'utilisation d'ORMs (Pas de Prisma, pas de Drizzle). Toutes les interactions avec la base de donnÃƒÂ©es doivent se faire via le client Supabase standard et les migrations en SQL brut.

### ConsÃƒÂ©quences
- **Avantage** : LÃƒÂ©gÃƒÂ¨retÃƒÂ© maximale, exÃƒÂ©cution rapide sur le Edge, et plein contrÃƒÂ´le sur les fonctionnalitÃƒÂ©s avancÃƒÂ©es de Postgres (pgvector, Full Text Search).
- **InconvÃƒÂ©nient** : Le typage TypeScript doit ÃƒÂªtre gÃƒÂ©rÃƒÂ© manuellement ou via le gÃƒÂ©nÃƒÂ©rateur de types Supabase, et l'ÃƒÂ©criture de requÃƒÂªtes complexes nÃƒÂ©cessite une bonne maÃƒÂ®trise du SQL.

---

## ADR 005 : API Serverless intÃƒÂ©grÃƒÂ©e au frontend Admin
**Date:** DÃƒÂ©cision Initiale
**Statut:** AcceptÃƒÂ©

### Contexte
Le projet est un monorepo, mais nous voulons des dÃƒÂ©ploiements Vercel simples sans configurations complexes de routage monorepo.

### DÃƒÂ©cision
Toutes les fonctions API serverless (LLM, RAG, Web Scraping) sont stockÃƒÂ©es dans le dossier `apps/admin/api/` au lieu de la racine du monorepo.

### ConsÃƒÂ©quences
- **Avantage** : Un seul dÃƒÂ©ploiement Vercel gÃƒÂ¨re ÃƒÂ  la fois l'application React Vite (Admin SPA) et les Edge Functions.
- **InconvÃƒÂ©nient** : Le code backend est couplÃƒÂ© au dossier du frontend d'administration.

---

## ADR 006 : Onboarding sans friction via des "Guest Tenants"
**Date:** DÃƒÂ©cision Initiale
**Statut:** AcceptÃƒÂ©

### Contexte
Nous voulons que les utilisateurs expÃƒÂ©rimentent le "Aha Moment" (le bot fonctionne sur leur site) avant mÃƒÂªme de s'inscrire ou de laisser leur email.

### DÃƒÂ©cision
Lorsqu'un utilisateur non connectÃƒÂ© teste une URL, le systÃƒÂ¨me crÃƒÂ©e un locataire invisible prÃƒÂ©fixÃƒÂ© par `Guest_`. Un script `cleanup-guests.js` purge ces donnÃƒÂ©es aprÃƒÂ¨s 24 heures pour ÃƒÂ©viter de polluer la base de donnÃƒÂ©es.

### ConsÃƒÂ©quences
- **Avantage** : Taux de conversion maximal.
- **InconvÃƒÂ©nient** : NÃƒÂ©cessite une gestion asynchrone du nettoyage (cron job) et une logique de migration (convertir un Guest en compte rÃƒÂ©el lors de l'inscription).

---

## ADR 007 : SÃƒÂ©paration stricte Base de DonnÃƒÂ©es Production / DÃƒÂ©veloppement
**Date:** 10 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lors d'une session de dÃƒÂ©veloppement, la commande `supabase db reset` a ÃƒÂ©tÃƒÂ© exÃƒÂ©cutÃƒÂ©e afin de consolider les migrations SQL. Cette commande a effacÃƒÂ© la base de donnÃƒÂ©es Supabase en ligne (production), supprimant les donnÃƒÂ©es de tous les clients dÃƒÂ©jÃƒÂ  onboardÃƒÂ©s (tenants, sites, documents, clÃƒÂ©s publiques).

### DÃƒÂ©cision
La commande `supabase db reset` (et toute commande destructive similaire) est **INTERDITE** sur la base de donnÃƒÂ©es de production Supabase. Cette commande doit uniquement ÃƒÂªtre utilisÃƒÂ©e dans un environnement **local Docker** (`supabase start`).

Les rÃƒÂ¨gles ÃƒÂ  respecter sont :
1. **Local uniquement** : `supabase db reset` Ã¢â€ â€™ uniquement aprÃƒÂ¨s `supabase start` (Docker local).
2. **Production** : Les modifications de schÃƒÂ©ma en production se font exclusivement via `supabase migration new` + `supabase db push` (pas de reset).
3. **VÃƒÂ©rification obligatoire** : Avant tout `db reset`, vÃƒÂ©rifier que `supabase status` affiche `Local` et non une URL Supabase cloud.

### ConsÃƒÂ©quences
- **Avantage** : Les donnÃƒÂ©es de production (clients, sites, documents indexÃƒÂ©s, clÃƒÂ©s d'API) sont protÃƒÂ©gÃƒÂ©es.
- **InconvÃƒÂ©nient** : Les migrations doivent ÃƒÂªtre testÃƒÂ©es localement avant d'ÃƒÂªtre poussÃƒÂ©es en production. Cela requiert que Docker Desktop soit installÃƒÂ© sur la machine de dÃƒÂ©veloppement.

---

## ADR 008 : AmÃƒÂ©lioration du Pipeline RAG Ã¢â‚¬â€ Chunking, FTS Bilingue et Jeu de Tests
**Date:** 10 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
AprÃƒÂ¨s inspection de la base Supabase pour `delafontaine.ca`, trois problÃƒÂ¨mes critiques ont ÃƒÂ©tÃƒÂ© identifiÃƒÂ©s :
1. Les 13 chunks indexÃƒÂ©s ÃƒÂ©taient tous issus d'une seule URL (`/`) Ã¢â‚¬â€ aucune sous-page indexÃƒÂ©e.
2. 6 chunks sur 13 contenaient du bruit RGPD/cookies (Google Analytics, CookieYes) Ã¢â‚¬â€ polluant les rÃƒÂ©ponses du bot.
3. La recherche FTS utilisait uniquement la config `french` sur un site **en anglais** Ã¢â€ â€™ 0 rÃƒÂ©sultats pour toute requÃƒÂªte anglaise.

### DÃƒÂ©cision

**Chunking :** Remplacement de `chunkText()` (dÃƒÂ©coupage naÃƒÂ¯f par taille) par `cleanAndChunk()` dans `start-scan.js` ET `update-document.js`. La nouvelle fonction :
- DÃƒÂ©coupe par **paragraphes sÃƒÂ©mantiques** (double newline / headers markdown)
- **Filtre** les paragraphes contenant des patterns de bruit (cookie, cookieyes, GTM, VISITOR_INFO, etc.)
- Exige un minimum de 25 mots de contenu utile par chunk
- Fonctionne pour le franÃƒÂ§ais ET l'anglais

**FTS Bilingue :** Migration `20260810000001_multilingual_fts.sql` :
- Ajout colonne `fts_en tsvector` (config `english`) sur la table `documents`
- Nouvelle RPC `search_documents_fts` qui cherche dans `fts` (fr) OU `fts_en` (en) et retourne le meilleur score
- Mise ÃƒÂ  jour de `match_documents_hybrid` pour supporter les deux langues
- Utilisation de `plainto_tsquery` (OR souple) plutÃƒÂ´t que `websearch_to_tsquery` (AND strict)

**`chat.js` :** Remplacement du `textSearch()` mono-langue par la RPC `search_documents_fts` avec fallback automatique sur l'ancien `textSearch` si la migration n'est pas encore dÃƒÂ©ployÃƒÂ©e.

**RÃƒÂ©-ingÃƒÂ©stion :** Script `reingest-delafontaine.mjs` Ã¢â‚¬â€ 12 pages ingÃƒÂ©rÃƒÂ©es via Jina Reader, rÃƒÂ©sultat : 23 chunks propres sur 9 URLs (vs 13 chunks pollus sur 1 URL).

**Tests :** Script `test-rag-search.js` Ã¢â‚¬â€ 17 cas de test couvrant :
- Groupe A (10) : happy path Ã¢â‚¬â€ contenu mÃƒÂ©tier confirmÃƒÂ©
- Groupe B (2) : bilingue FRÃ¢â€ â€™EN (tests informatifs, limite FTS attendue)
- Groupe C (3) : nÃƒÂ©gatifs stricts (hors-sujet, RGPD, prix absents)
- Groupe D (2) : qualitÃƒÂ© Ã¢â‚¬â€ absence de bruit, pertinence du ranking

RÃƒÂ©sultat final : **17/17 tests passent (100%)**.

### ConsÃƒÂ©quences
- **Avantage** : Toute future ingÃƒÂ©stion (nouvel onboarding client) bÃƒÂ©nÃƒÂ©ficie automatiquement du filtre de bruit et du FTS bilingue.
- **Avantage** : Le bot peut rÃƒÂ©pondre correctement aux questions en anglais sur des sites anglophones.
- **Limite restante** : Les requÃƒÂªtes franÃƒÂ§aises sur du contenu anglais ne sont pas encore couvertes par FTS (nÃƒÂ©cessite des embeddings sÃƒÂ©mantiques Ã¢â‚¬â€ ÃƒÂ©tape future).
- **RÃƒÂ¨gle** : Tout changement ÃƒÂ  la logique de chunking DOIT ÃƒÂªtre appliquÃƒÂ© simultanÃƒÂ©ment dans `start-scan.js` ET `update-document.js` pour garder la cohÃƒÂ©rence.

---

## ADR 009 : IntÃƒÂ©gration des Embeddings SÃƒÂ©mantiques Multilingues Jina AI v3 (768d)
**Date:** 10 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Bien que le FTS bilingue (ADR-008) ait rÃƒÂ©solu les requÃƒÂªtes exactes en franÃƒÂ§ais et en anglais, il prÃƒÂ©sentait deux limites fondamentales :
1. **Match cross-langues** : Une question posÃƒÂ©e en franÃƒÂ§ais (`"entreprise familiale"`) sur un site 100% anglais (`delafontaine.ca`) retournait 0 rÃƒÂ©sultat FTS.
2. **Recherche conceptuelle** : Les synonymes et requÃƒÂªtes paraphrasÃƒÂ©es sans mots-clÃƒÂ©s exacts n'ÃƒÂ©taient pas capturÃƒÂ©s.

### DÃƒÂ©cision

1. **ModÃƒÂ¨le d'Embeddings** : Adoption de **`jina-embeddings-v3`** (Jina AI) configurÃƒÂ© ÃƒÂ  **768 dimensions**, qui matche exactement la colonne Supabase `embedding vector(768)` sans modification de schÃƒÂ©ma SQL.
2. **Task-Specific Embeddings** :
   - `retrieval.passage` pour le batch chunking lors de l'ingestion (`start-scan.js`, `update-document.js`, `reingest-delafontaine.mjs`).
   - `retrieval.query` pour les requÃƒÂªtes de recherche utilisateur dans `api/chat.js`.
3. **Recherche Hybride RRF (Reciprocal Rank Fusion)** : L'API `chat.js` gÃƒÂ©nÃƒÂ¨re l'embedding de la requÃƒÂªte utilisateur et appelle la RPC `match_documents_hybrid` qui combine :
   - Distance cosinus sÃƒÂ©mantique (`embedding <=> query_embedding`)
   - Rank FTS bilingue (`fts` FR + `fts_en` EN)
   - Fallback gracieux sur FTS bilingue pur ou `textSearch` si la clÃƒÂ© ou le service d'embeddings est indisponible.
4. **Validation par Suite de Tests** : 17/17 tests RAG valides avec **100% de rÃƒÂ©ussite** sur `match_documents_hybrid (Semantic Vector 768d + FTS)`. Les requÃƒÂªtes cross-langues FR Ã¢â€ â€™ EN (`"entreprise familiale"`, `"portes acier coupe-feu"`) retournent les bons chunks pertinents.

### ConsÃƒÂ©quences
- **Avantage** : Recherche RAG sÃƒÂ©mantique multilingue robuste supportant le franÃƒÂ§ais, l'anglais, les synonymes et les paraphrases.
- **Avantage** : RÃƒÂ©silience maximale avec fallback automatique sur FTS bilingue si l'API d'embedding ÃƒÂ©choue.
- **SÃƒÂ©curitÃƒÂ©/Performance** : Batching d'embeddings lors de l'ingestion (1 seul appel HTTP par page).

---

## ADR 010 : IntÃƒÂ©gration du Paiement via Stripe (Subscriptions + Billing Portal)
**Date:** 11 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
La plateforme avait une page `Pricing.jsx` avec des plans (Starter 29$/mois, Pro 99$/mois, Enterprise sur mesure) mais aucun mÃƒÂ©canisme de paiement rÃƒÂ©el. L'objectif est de rendre la plateforme payante en utilisant un fournisseur de paiement standard.

### DÃƒÂ©cision
Nous adoptons **Stripe** comme fournisseur de paiement unique, avec les composants suivants :

1. **Stripe Checkout** (mode `subscription`) Ã¢â‚¬â€ Page de paiement hÃƒÂ©bergÃƒÂ©e par Stripe, sans PCI-DSS cÃƒÂ´tÃƒÂ© client.
2. **Stripe Billing Portal** Ã¢â‚¬â€ Portail client Stripe pour gÃƒÂ©rer les abonnements (annulation, changement de CB, factures).
3. **Stripe Webhooks** Ã¢â‚¬â€ Synchronisation asynchrone de l'ÃƒÂ©tat d'abonnement dans Supabase (`tenants.plan`, `plan_status`, `stripe_subscription_id`).

**Fichiers crÃƒÂ©ÃƒÂ©s :**
- `api/create-checkout-session.js` Ã¢â‚¬â€ CrÃƒÂ©e la session Checkout, attache/crÃƒÂ©e le Customer Stripe.
- `api/create-portal-session.js` Ã¢â‚¬â€ CrÃƒÂ©e la session Billing Portal.
- `api/stripe-webhook.js` Ã¢â‚¬â€ Traite `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`.
- `supabase/migrations/20260811000001_stripe_billing.sql` Ã¢â‚¬â€ Ajoute `stripe_subscription_id`, `plan_status`, `plan_expires_at` sur `tenants`.
- `src/components/PlanBadge.jsx` Ã¢â‚¬â€ Badge plan actuel visible dans le Header.
- `src/components/PaymentSuccessPage.jsx` Ã¢â‚¬â€ Page de confirmation post-paiement avec animation.

**Routing Vercel :** `/payment-success` et `/payment-cancel` redirigent vers `index.html` (SPA).

### ConsÃƒÂ©quences
- **Avantage** : Aucune donnÃƒÂ©e de carte ne transite par nos serveurs (Stripe Checkout hÃƒÂ©bergÃƒÂ©).
- **Avantage** : Le Customer Portal Stripe gÃƒÂ¨re automatiquement les factures PDF, mises ÃƒÂ  jour CB, et annulations.
- **Avantage** : Les webhooks garantissent la cohÃƒÂ©rence de l'ÃƒÂ©tat mÃƒÂªme si le client ferme le navigateur avant la redirection.
- **RÃƒÂ¨gle** : Toute modification du pricing (ajout de plan, changement de tarif) doit crÃƒÂ©er un nouveau `Price` dans Stripe (jamais modifier un Price existant) et mettre ÃƒÂ  jour `STRIPE_PRICE_ID_*` dans `.env.local` + Vercel.
- **RÃƒÂ¨gle** : Le `SUPABASE_SERVICE_ROLE_KEY` doit ÃƒÂªtre utilisÃƒÂ© dans les API routes webhook (et non la clÃƒÂ© anon) pour mettre ÃƒÂ  jour la table `tenants`.

---

## ADR 011 : Optimisation AvancÃƒÂ©e du Pipeline RAG (DÃƒÂ©-truncation, Overlap SÃƒÂ©mantique & Enrichissement MÃƒÂ©tadonnÃƒÂ©es)
**Date:** 13 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Bien que l'ADR-008 et l'ADR-009 aient posÃƒÂ© les bases du FTS bilingue et des Embeddings Jina v3 (768d), le pipeline RAG souffrait encore de 3 limites majeures :
1. **Troncature arbitraire** : `start-scan.js` et `update-document.js` appliquaient `chunks.slice(0, 20)`, ce qui abandonnait le contenu au-delÃƒÂ  de 20 chunks (~16 000 caractÃƒÂ¨res).
2. **Coupure du contexte** : La dÃƒÂ©coupe par paragraphes ne prÃƒÂ©servait aucun chevauchement, risquant de fragmenter une idÃƒÂ©e ou une liste ÃƒÂ  la frontiÃƒÂ¨re de deux chunks.
3. **Absence de mÃƒÂ©tadonnÃƒÂ©es de source** : Les chunks ÃƒÂ©taient stockÃƒÂ©s nus, sans que l'embedding ou le modÃƒÂ¨le LLM ne sache de quelle URL provient le texte.

### DÃƒÂ©cision
1. **Suppression de la limite de 20 chunks** : Indexation intÃƒÂ©grale des pages web.
2. **GÃƒÂ©nÃƒÂ©ration d'embeddings par lots (Batching pour Free Tier Jina)** : Traitement des embeddings par paquets de 20 chunks (`BATCH_SIZE = 20`) avec une temporisation de 200 ms entre les lots pour respecter strictement les quotas et limites de dÃƒÂ©bit du Tier Gratuit Jina AI.
3. **Overlap SÃƒÂ©mantique** : Injection automatique des 20 derniers mots du chunk prÃƒÂ©cÃƒÂ©dent au dÃƒÂ©but du chunk suivant (`... [overlap]\n\n[nouveau texte]`) dans `cleanAndChunk`.
4. **Enrichissement des MÃƒÂ©tadonnÃƒÂ©es** : PrÃƒÂ©fixe explicite `[Source URL: {targetUrl}]\n` ajoutÃƒÂ© directement ÃƒÂ  chaque chunk avant son embedding et stockage vectoriel.
5. **Augmentation de la fenÃƒÂªtre de contexte dans `chat.js`** : Augmentation du nombre de chunks extraits (`match_count` portÃƒÂ© de 5 ÃƒÂ  10) lors de la recherche hybride `match_documents_hybrid` pour fournir un contexte plus riche et exhaustif au LLM.

### ConsÃƒÂ©quences
- **Avantage** : Couverture complÃƒÂ¨te des pages volumineuses sans perte de donnÃƒÂ©es.
- **Avantage** : AmÃƒÂ©lioration sensible du recall vectoriel grÃƒÂ¢ce aux mÃƒÂ©tadonnÃƒÂ©es d'URL et ÃƒÂ  l'overlap sÃƒÂ©mantique.
- **Avantage** : Respect garanti des limites d'API pour le tier gratuit de Jina Embeddings.
- **RÃƒÂ¨gle** : Toute mise ÃƒÂ  jour de la logique de chunking ou de batching doit impÃƒÂ©rativement ÃƒÂªtre rÃƒÂ©percutÃƒÂ©e de faÃƒÂ§on identique dans `start-scan.js` et `update-document.js`.

---

## ADR 012 : Flux d'Onboarding Synchrone, Statuts de Pages & Re-crawl avec Nettoyage DB
**Date:** 13 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'expÃƒÂ©rience d'onboarding initiale comportait un ÃƒÂ©cran d'attente bloquant pendant le crawl en arriÃƒÂ¨re-plan, ce qui laissait l'utilisateur dans l'ignorance de l'avancement. De plus, les boutons d'activation individuelle de page et le re-scan complet avec suppression des anciens morceaux de documents n'ÃƒÂ©taient pas synchronisÃƒÂ©s de maniÃƒÂ¨re transparente.

### DÃƒÂ©cision
1. **Transition ImmÃƒÂ©diate au Dashboard** : Soumettre une URL crÃƒÂ©e le site et affiche immÃƒÂ©diatement le Tableau de Bord client avec le tiroir *GÃƒÂ©rer la base de connaissances* ouvert.
2. **Crawl Synchrone avec Progression Textuelle** : L'exploration (`/api/crawl-site`) et l'indexation (`/api/start-scan`) s'exÃƒÂ©cutent sÃƒÂ©quentiellement en direct sous les yeux de l'utilisateur avec des messages de statut explicites (`Indexation page X/N : [URL]`).
3. **Verrouillage du Bouton AperÃƒÂ§u** : Le bouton "AperÃƒÂ§u Plein Ãƒâ€°cran & Test Live" est dÃƒÂ©sactivÃƒÂ© tant que `isCrawling` est actif (`opacity-70 cursor-not-allowed`) pour ÃƒÂ©viter de tester un bot partiellement indexÃƒÂ©.
4. **Statuts de Pages Granulaires** : Le tableau des pages affiche pour chaque ligne l'un des trois statuts :
   - `loading` : Spinner animÃƒÂ© + badge ambre (En cours d'indexation)
   - `loaded` : Badge vert avec coche (IndexÃƒÂ©)
   - `disabled` : Badge gris (IgnorÃƒÂ© / DÃƒÂ©sactivÃƒÂ©)
5. **Actions par Page (Activer / DÃƒÂ©sactiver)** : Bouton dÃƒÂ©diÃƒÂ© permettant de dÃƒÂ©sactiver une page (suppression des chunks dans Supabase) ou de la rÃƒÂ©activer (dÃƒÂ©clenchement du scan et passage en `loading` -> `loaded`).
6. **Bouton Re-scanner / RafraÃƒÂ®chir avec Purge DB** : Le bouton de re-scan effectue d'abord un nettoyage complet des anciens chunks de la table Supabase (`DELETE FROM documents WHERE site_id = ...`) avant de relancer le crawl synchrone complet.

### ConsÃƒÂ©quences
- **Avantage** : Transparence totale pour l'utilisateur qui suit l'indexation en temps rÃƒÂ©el.
- **Avantage** : PrÃƒÂ©vention des erreurs en empÃƒÂªchant l'ouverture de la dÃƒÂ©mo pendant le crawl.
- **Avantage** : Nettoyage propre des donnÃƒÂ©es obsolÃƒÂ¨tes lors d'un re-crawl d'un site.

---

## ADR 013 : IntÃƒÂ©gration du RÃƒÂ©sumÃƒÂ© de Site Web (Site Summary RAG Context)
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lorsqu'un visiteur pose une question gÃƒÂ©nÃƒÂ©rale sur une entreprise (ex: "Que fait votre entreprise ?", "Quels sont vos domaines d'expertise ?"), le chatbot devait prÃƒÂ©cÃƒÂ©demment dÃƒÂ©clencher une recherche RAG par chunks qui pouvait retourner des fragments isolÃƒÂ©s au lieu d'une vue d'ensemble cohÃƒÂ©rente du site.

### DÃƒÂ©cision
1. **Extraction & GÃƒÂ©nÃƒÂ©ration AI** : CrÃƒÂ©ation du module `api/generate-summary.js` et de la fonction `generateWebsiteSummary` (`api/lib/llm.js`). Le systÃƒÂ¨me extrait le contenu brut de la page d'accueil ou des chunks du site et gÃƒÂ©nÃƒÂ¨re un rÃƒÂ©sumÃƒÂ© structurÃƒÂ© et concis par le LLM.
2. **Stockage Supabase Dedicated** : CrÃƒÂ©ation de la table `site_summaries` (`supabase/migrations/20260814000001_site_summaries.sql`) avec contrainte unique `(tenant_id, site_id)` et Row Level Security (RLS).
3. **Auto-gÃƒÂ©nÃƒÂ©ration lors de l'ingestion** : `api/start-scan.js` dÃƒÂ©clenche automatiquement la gÃƒÂ©nÃƒÂ©ration et l'upsert du rÃƒÂ©sumÃƒÂ© lors de l'indexation de la page d'accueil.
4. **Injection dans le Prompt systÃƒÂ¨me (`api/chat.js`)** : Le rÃƒÂ©sumÃƒÂ© est extrait au dÃƒÂ©but de chaque session de chat et directement injectÃƒÂ© dans le prompt systÃƒÂ¨me du bot.
5. **Robustesse et Fallback** : Si aucun rÃƒÂ©sumÃƒÂ© n'est prÃƒÂ©sent (ou en cas d'erreur), le chatbot conserve son comportement RAG classique sans aucune interruption.

### ConsÃƒÂ©quences
- **Avantage** : RÃƒÂ©ponses immÃƒÂ©diates et exhaustives aux questions d'ensemble sur l'entreprise dÃƒÂ¨s le premier message sans coÃƒÂ»t d'outil supplÃƒÂ©mentaire.
- **Avantage** : AmÃƒÂ©lioration drastique de la qualitÃƒÂ© perÃƒÂ§ue des rÃƒÂ©ponses initiales du chatbot.
- **RÃƒÂ¨gle** : Toute mise ÃƒÂ  jour de la table `site_summaries` doit s'effectuer via des requÃƒÂªtes SQL/Supabase brutes (conformÃƒÂ©ment ÃƒÂ  l'ADR-004).

---

## ADR 014 : Post-traitement Atomique des Statuts de Crawl & DÃƒÂ©sactivation des Pages Vides
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
La dÃƒÂ©tection des pages vides (`empty`) ou protÃƒÂ©gÃƒÂ©es (`protected`) et la dÃƒÂ©sactivation des cases ÃƒÂ  cocher s'exÃƒÂ©cutaient de maniÃƒÂ¨re itÃƒÂ©rative au sein de la boucle de scan. Cela entraÃƒÂ®nait des clignotements d'interface, des dÃƒÂ©sactivations prÃƒÂ©maturÃƒÂ©es et des conflits d'ÃƒÂ©tat pendant que le crawl ÃƒÂ©tait encore en cours.

### DÃƒÂ©cision
1. **SÃƒÂ©paration Stricte entre Scan et Post-Traitement** : Durant la phase de scan, toutes les pages dÃƒÂ©couvertes restent affichÃƒÂ©es avec le statut `loading` et toutes les URL demeurent sÃƒÂ©lectionnÃƒÂ©es dans `selectedUrls`.
2. **ExÃƒÂ©cution du Marquage uniquement APRÃƒË†S la Fin du Crawl** : Une fois la boucle de scan de toutes les pages 100% terminÃƒÂ©e, une passe de post-traitement vÃƒÂ©rifie le nombre rÃƒÂ©el de morceaux de document enregistrÃƒÂ©s dans Supabase (`documents`).
3. **Mise ÃƒÂ  Jour Atomique** : Les statuts finaux (`loaded`, `empty`, `protected`) et les dÃƒÂ©sactivations de sÃƒÂ©lection sont appliquÃƒÂ©s en une seule mise ÃƒÂ  jour d'ÃƒÂ©tat atomique (`setDiscoveredPages` et `setSelectedUrls`).

### ConsÃƒÂ©quences
- **Avantage** : Ãƒâ€°limination complÃƒÂ¨te des bugs d'affichage et des clignotements de statut durant le crawl.
- **Avantage** : Garantie que les pages ne sont dÃƒÂ©sactivÃƒÂ©es que si et seulement si l'indexation globale du site est totalement achevÃƒÂ©e et vÃƒÂ©rifiÃƒÂ©e en base de donnÃƒÂ©es.

---

## ADR 015 : Bouton d'Ouverture de l'AperÃƒÂ§u dans un Nouvel Onglet
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lors de l'utilisation de la modale d'aperÃƒÂ§u plein ÃƒÂ©cran (`showPreviewModal`), l'utilisateur souhaitait avoir la possibilitÃƒÂ© d'ouvrir rapidement le site prÃƒÂ©visualisÃƒÂ© dans un nouvel onglet du navigateur.

### DÃƒÂ©cision
Ajout d'un bouton "Ouvrir dans un nouvel onglet" dans la barre de contrÃƒÂ´le supÃƒÂ©rieure de la modale d'aperÃƒÂ§u (`ClientOnboarding.jsx`). Le bouton s'appuie sur une balise `<a>` avec `target="_blank"`, `rel="noopener noreferrer"`, et comporte l'icÃƒÂ´ne `ExternalLink` issue de `lucide-react`.

### ConsÃƒÂ©quences
- **Avantage** : AccÃƒÂ¨s direct en 1-clic au site web de destination dans un nouvel onglet sans fermer la session de test ou le tableau de bord d'administration.

---

## ADR 016 : ParallÃƒÂ©lisation de l'Ingestion (Batching Client-Side)
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'ingestion des pages web dÃƒÂ©couvertes (crawling) s'effectuait de maniÃƒÂ¨re sÃƒÂ©quentielle (une page ÃƒÂ  la fois) dans `ClientOnboarding.jsx`. Cela rendait le processus trÃƒÂ¨s lent pour les sites contenant beaucoup de pages, car chaque page devait attendre que la prÃƒÂ©cÃƒÂ©dente termine son scan (`/api/start-scan`) avant de commencer.

- Mise ÃƒÂ  jour de `match_documents_hybrid` pour supporter les deux langues
- Utilisation de `plainto_tsquery` (OR souple) plutÃƒÂ´t que `websearch_to_tsquery` (AND strict)

**`chat.js` :** Remplacement du `textSearch()` mono-langue par la RPC `search_documents_fts` avec fallback automatique sur l'ancien `textSearch` si la migration n'est pas encore dÃƒÂ©ployÃƒÂ©e.

**RÃƒÂ©-ingÃƒÂ©stion :** Script `reingest-delafontaine.mjs` Ã¢â‚¬â€ 12 pages ingÃƒÂ©rÃƒÂ©es via Jina Reader, rÃƒÂ©sultat : 23 chunks propres sur 9 URLs (vs 13 chunks pollus sur 1 URL).

**Tests :** Script `test-rag-search.js` Ã¢â‚¬â€ 17 cas de test couvrant :
- Groupe A (10) : happy path Ã¢â‚¬â€ contenu mÃƒÂ©tier confirmÃƒÂ©
- Groupe B (2) : bilingue FRÃ¢â€ â€™EN (tests informatifs, limite FTS attendue)
- Groupe C (3) : nÃƒÂ©gatifs stricts (hors-sujet, RGPD, prix absents)
- Groupe D (2) : qualitÃƒÂ© Ã¢â‚¬â€ absence de bruit, pertinence du ranking

RÃƒÂ©sultat final : **17/17 tests passent (100%)**.

### ConsÃƒÂ©quences
- **Avantage** : Toute future ingÃƒÂ©stion (nouvel onboarding client) bÃƒÂ©nÃƒÂ©ficie automatiquement du filtre de bruit et du FTS bilingue.
- **Avantage** : Le bot peut rÃƒÂ©pondre correctement aux questions en anglais sur des sites anglophones.
- **Limite restante** : Les requÃƒÂªtes franÃƒÂ§aises sur du contenu anglais ne sont pas encore couvertes par FTS (nÃƒÂ©cessite des embeddings sÃƒÂ©mantiques Ã¢â‚¬â€ ÃƒÂ©tape future).
- **RÃƒÂ¨gle** : Tout changement ÃƒÂ  la logique de chunking DOIT ÃƒÂªtre appliquÃƒÂ© simultanÃƒÂ©ment dans `start-scan.js` ET `update-document.js` pour garder la cohÃƒÂ©rence.

---

## ADR 009 : IntÃƒÂ©gration des Embeddings SÃƒÂ©mantiques Multilingues Jina AI v3 (768d)
**Date:** 10 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Bien que le FTS bilingue (ADR-008) ait rÃƒÂ©solu les requÃƒÂªtes exactes en franÃƒÂ§ais et en anglais, il prÃƒÂ©sentait deux limites fondamentales :
1. **Match cross-langues** : Une question posÃƒÂ©e en franÃƒÂ§ais (`"entreprise familiale"`) sur un site 100% anglais (`delafontaine.ca`) retournait 0 rÃƒÂ©sultat FTS.
2. **Recherche conceptuelle** : Les synonymes et requÃƒÂªtes paraphrasÃƒÂ©es sans mots-clÃƒÂ©s exacts n'ÃƒÂ©taient pas capturÃƒÂ©s.

### DÃƒÂ©cision

1. **ModÃƒÂ¨le d'Embeddings** : Adoption de **`jina-embeddings-v3`** (Jina AI) configurÃƒÂ© ÃƒÂ  **768 dimensions**, qui matche exactement la colonne Supabase `embedding vector(768)` sans modification de schÃƒÂ©ma SQL.
2. **Task-Specific Embeddings** :
   - `retrieval.passage` pour le batch chunking lors de l'ingestion (`start-scan.js`, `update-document.js`, `reingest-delafontaine.mjs`).
   - `retrieval.query` pour les requÃƒÂªtes de recherche utilisateur dans `api/chat.js`.
3. **Recherche Hybride RRF (Reciprocal Rank Fusion)** : L'API `chat.js` gÃƒÂ©nÃƒÂ¨re l'embedding de la requÃƒÂªte utilisateur et appelle la RPC `match_documents_hybrid` qui combine :
   - Distance cosinus sÃƒÂ©mantique (`embedding <=> query_embedding`)
   - Rank FTS bilingue (`fts` FR + `fts_en` EN)
   - Fallback gracieux sur FTS bilingue pur ou `textSearch` si la clÃƒÂ© ou le service d'embeddings est indisponible.
4. **Validation par Suite de Tests** : 17/17 tests RAG valides avec **100% de rÃƒÂ©ussite** sur `match_documents_hybrid (Semantic Vector 768d + FTS)`. Les requÃƒÂªtes cross-langues FR Ã¢â€ â€™ EN (`"entreprise familiale"`, `"portes acier coupe-feu"`) retournent les bons chunks pertinents.

### ConsÃƒÂ©quences
- **Avantage** : Recherche RAG sÃƒÂ©mantique multilingue robuste supportant le franÃƒÂ§ais, l'anglais, les synonymes et les paraphrases.
- **Avantage** : RÃƒÂ©silience maximale avec fallback automatique sur FTS bilingue si l'API d'embedding ÃƒÂ©choue.
- **SÃƒÂ©curitÃƒÂ©/Performance** : Batching d'embeddings lors de l'ingestion (1 seul appel HTTP par page).

---

## ADR 010 : IntÃƒÂ©gration du Paiement via Stripe (Subscriptions + Billing Portal)
**Date:** 11 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
La plateforme avait une page `Pricing.jsx` avec des plans (Starter 29$/mois, Pro 99$/mois, Enterprise sur mesure) mais aucun mÃƒÂ©canisme de paiement rÃƒÂ©el. L'objectif est de rendre la plateforme payante en utilisant un fournisseur de paiement standard.

### DÃƒÂ©cision
Nous adoptons **Stripe** comme fournisseur de paiement unique, avec les composants suivants :

1. **Stripe Checkout** (mode `subscription`) Ã¢â‚¬â€ Page de paiement hÃƒÂ©bergÃƒÂ©e par Stripe, sans PCI-DSS cÃƒÂ´tÃƒÂ© client.
2. **Stripe Billing Portal** Ã¢â‚¬â€ Portail client Stripe pour gÃƒÂ©rer les abonnements (annulation, changement de CB, factures).
3. **Stripe Webhooks** Ã¢â‚¬â€ Synchronisation asynchrone de l'ÃƒÂ©tat d'abonnement dans Supabase (`tenants.plan`, `plan_status`, `stripe_subscription_id`).

**Fichiers crÃƒÂ©ÃƒÂ©s :**
- `api/create-checkout-session.js` Ã¢â‚¬â€ CrÃƒÂ©e la session Checkout, attache/crÃƒÂ©e le Customer Stripe.
- `api/create-portal-session.js` Ã¢â‚¬â€ CrÃƒÂ©e la session Billing Portal.
- `api/stripe-webhook.js` Ã¢â‚¬â€ Traite `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`.
- `supabase/migrations/20260811000001_stripe_billing.sql` Ã¢â‚¬â€ Ajoute `stripe_subscription_id`, `plan_status`, `plan_expires_at` sur `tenants`.
- `src/components/PlanBadge.jsx` Ã¢â‚¬â€ Badge plan actuel visible dans le Header.
- `src/components/PaymentSuccessPage.jsx` Ã¢â‚¬â€ Page de confirmation post-paiement avec animation.

**Routing Vercel :** `/payment-success` et `/payment-cancel` redirigent vers `index.html` (SPA).

### ConsÃƒÂ©quences
- **Avantage** : Aucune donnÃƒÂ©e de carte ne transite par nos serveurs (Stripe Checkout hÃƒÂ©bergÃƒÂ©).
- **Avantage** : Le Customer Portal Stripe gÃƒÂ¨re automatiquement les factures PDF, mises ÃƒÂ  jour CB, et annulations.
- **Avantage** : Les webhooks garantissent la cohÃƒÂ©rence de l'ÃƒÂ©tat mÃƒÂªme si le client ferme le navigateur avant la redirection.
- **RÃƒÂ¨gle** : Toute modification du pricing (ajout de plan, changement de tarif) doit crÃƒÂ©er un nouveau `Price` dans Stripe (jamais modifier un Price existant) et mettre ÃƒÂ  jour `STRIPE_PRICE_ID_*` dans `.env.local` + Vercel.
- **RÃƒÂ¨gle** : Le `SUPABASE_SERVICE_ROLE_KEY` doit ÃƒÂªtre utilisÃƒÂ© dans les API routes webhook (et non la clÃƒÂ© anon) pour mettre ÃƒÂ  jour la table `tenants`.

---

## ADR 011 : Optimisation AvancÃƒÂ©e du Pipeline RAG (DÃƒÂ©-truncation, Overlap SÃƒÂ©mantique & Enrichissement MÃƒÂ©tadonnÃƒÂ©es)
**Date:** 13 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Bien que l'ADR-008 et l'ADR-009 aient posÃƒÂ© les bases du FTS bilingue et des Embeddings Jina v3 (768d), le pipeline RAG souffrait encore de 3 limites majeures :
1. **Troncature arbitraire** : `start-scan.js` et `update-document.js` appliquaient `chunks.slice(0, 20)`, ce qui abandonnait le contenu au-delÃƒÂ  de 20 chunks (~16 000 caractÃƒÂ¨res).
2. **Coupure du contexte** : La dÃƒÂ©coupe par paragraphes ne prÃƒÂ©servait aucun chevauchement, risquant de fragmenter une idÃƒÂ©e ou une liste ÃƒÂ  la frontiÃƒÂ¨re de deux chunks.
3. **Absence de mÃƒÂ©tadonnÃƒÂ©es de source** : Les chunks ÃƒÂ©taient stockÃƒÂ©s nus, sans que l'embedding ou le modÃƒÂ¨le LLM ne sache de quelle URL provient le texte.

### DÃƒÂ©cision
1. **Suppression de la limite de 20 chunks** : Indexation intÃƒÂ©grale des pages web.
2. **GÃƒÂ©nÃƒÂ©ration d'embeddings par lots (Batching pour Free Tier Jina)** : Traitement des embeddings par paquets de 20 chunks (`BATCH_SIZE = 20`) avec une temporisation de 200 ms entre les lots pour respecter strictement les quotas et limites de dÃƒÂ©bit du Tier Gratuit Jina AI.
3. **Overlap SÃƒÂ©mantique** : Injection automatique des 20 derniers mots du chunk prÃƒÂ©cÃƒÂ©dent au dÃƒÂ©but du chunk suivant (`... [overlap]\n\n[nouveau texte]`) dans `cleanAndChunk`.
4. **Enrichissement des MÃƒÂ©tadonnÃƒÂ©es** : PrÃƒÂ©fixe explicite `[Source URL: {targetUrl}]\n` ajoutÃƒÂ© directement ÃƒÂ  chaque chunk avant son embedding et stockage vectoriel.
5. **Augmentation de la fenÃƒÂªtre de contexte dans `chat.js`** : Augmentation du nombre de chunks extraits (`match_count` portÃƒÂ© de 5 ÃƒÂ  10) lors de la recherche hybride `match_documents_hybrid` pour fournir un contexte plus riche et exhaustif au LLM.

### ConsÃƒÂ©quences
- **Avantage** : Couverture complÃƒÂ¨te des pages volumineuses sans perte de donnÃƒÂ©es.
- **Avantage** : AmÃƒÂ©lioration sensible du recall vectoriel grÃƒÂ¢ce aux mÃƒÂ©tadonnÃƒÂ©es d'URL et ÃƒÂ  l'overlap sÃƒÂ©mantique.
- **Avantage** : Respect garanti des limites d'API pour le tier gratuit de Jina Embeddings.
- **RÃƒÂ¨gle** : Toute mise ÃƒÂ  jour de la logique de chunking ou de batching doit impÃƒÂ©rativement ÃƒÂªtre rÃƒÂ©percutÃƒÂ©e de faÃƒÂ§on identique dans `start-scan.js` et `update-document.js`.

---

## ADR 012 : Flux d'Onboarding Synchrone, Statuts de Pages & Re-crawl avec Nettoyage DB
**Date:** 13 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'expÃƒÂ©rience d'onboarding initiale comportait un ÃƒÂ©cran d'attente bloquant pendant le crawl en arriÃƒÂ¨re-plan, ce qui laissait l'utilisateur dans l'ignorance de l'avancement. De plus, les boutons d'activation individuelle de page et le re-scan complet avec suppression des anciens morceaux de documents n'ÃƒÂ©taient pas synchronisÃƒÂ©s de maniÃƒÂ¨re transparente.

### DÃƒÂ©cision
1. **Transition ImmÃƒÂ©diate au Dashboard** : Soumettre une URL crÃƒÂ©e le site et affiche immÃƒÂ©diatement le Tableau de Bord client avec le tiroir *GÃƒÂ©rer la base de connaissances* ouvert.
2. **Crawl Synchrone avec Progression Textuelle** : L'exploration (`/api/crawl-site`) et l'indexation (`/api/start-scan`) s'exÃƒÂ©cutent sÃƒÂ©quentiellement en direct sous les yeux de l'utilisateur avec des messages de statut explicites (`Indexation page X/N : [URL]`).
3. **Verrouillage du Bouton AperÃƒÂ§u** : Le bouton "AperÃƒÂ§u Plein Ãƒâ€°cran & Test Live" est dÃƒÂ©sactivÃƒÂ© tant que `isCrawling` est actif (`opacity-70 cursor-not-allowed`) pour ÃƒÂ©viter de tester un bot partiellement indexÃƒÂ©.
4. **Statuts de Pages Granulaires** : Le tableau des pages affiche pour chaque ligne l'un des trois statuts :
   - `loading` : Spinner animÃƒÂ© + badge ambre (En cours d'indexation)
   - `loaded` : Badge vert avec coche (IndexÃƒÂ©)
   - `disabled` : Badge gris (IgnorÃƒÂ© / DÃƒÂ©sactivÃƒÂ©)
5. **Actions par Page (Activer / DÃƒÂ©sactiver)** : Bouton dÃƒÂ©diÃƒÂ© permettant de dÃƒÂ©sactiver une page (suppression des chunks dans Supabase) ou de la rÃƒÂ©activer (dÃƒÂ©clenchement du scan et passage en `loading` -> `loaded`).
6. **Bouton Re-scanner / RafraÃƒÂ®chir avec Purge DB** : Le bouton de re-scan effectue d'abord un nettoyage complet des anciens chunks de la table Supabase (`DELETE FROM documents WHERE site_id = ...`) avant de relancer le crawl synchrone complet.

### ConsÃƒÂ©quences
- **Avantage** : Transparence totale pour l'utilisateur qui suit l'indexation en temps rÃƒÂ©el.
- **Avantage** : PrÃƒÂ©vention des erreurs en empÃƒÂªchant l'ouverture de la dÃƒÂ©mo pendant le crawl.
- **Avantage** : Nettoyage propre des donnÃƒÂ©es obsolÃƒÂ¨tes lors d'un re-crawl d'un site.

---

## ADR 013 : IntÃƒÂ©gration du RÃƒÂ©sumÃƒÂ© de Site Web (Site Summary RAG Context)
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lorsqu'un visiteur pose une question gÃƒÂ©nÃƒÂ©rale sur une entreprise (ex: "Que fait votre entreprise ?", "Quels sont vos domaines d'expertise ?"), le chatbot devait prÃƒÂ©cÃƒÂ©demment dÃƒÂ©clencher une recherche RAG par chunks qui pouvait retourner des fragments isolÃƒÂ©s au lieu d'une vue d'ensemble cohÃƒÂ©rente du site.

### DÃƒÂ©cision
1. **Extraction & GÃƒÂ©nÃƒÂ©ration AI** : CrÃƒÂ©ation du module `api/generate-summary.js` et de la fonction `generateWebsiteSummary` (`api/lib/llm.js`). Le systÃƒÂ¨me extrait le contenu brut de la page d'accueil ou des chunks du site et gÃƒÂ©nÃƒÂ¨re un rÃƒÂ©sumÃƒÂ© structurÃƒÂ© et concis par le LLM.
2. **Stockage Supabase Dedicated** : CrÃƒÂ©ation de la table `site_summaries` (`supabase/migrations/20260814000001_site_summaries.sql`) avec contrainte unique `(tenant_id, site_id)` et Row Level Security (RLS).
3. **Auto-gÃƒÂ©nÃƒÂ©ration lors de l'ingestion** : `api/start-scan.js` dÃƒÂ©clenche automatiquement la gÃƒÂ©nÃƒÂ©ration et l'upsert du rÃƒÂ©sumÃƒÂ© lors de l'indexation de la page d'accueil.
4. **Injection dans le Prompt systÃƒÂ¨me (`api/chat.js`)** : Le rÃƒÂ©sumÃƒÂ© est extrait au dÃƒÂ©but de chaque session de chat et directement injectÃƒÂ© dans le prompt systÃƒÂ¨me du bot.
5. **Robustesse et Fallback** : Si aucun rÃƒÂ©sumÃƒÂ© n'est prÃƒÂ©sent (ou en cas d'erreur), le chatbot conserve son comportement RAG classique sans aucune interruption.

### ConsÃƒÂ©quences
- **Avantage** : RÃƒÂ©ponses immÃƒÂ©diates et exhaustives aux questions d'ensemble sur l'entreprise dÃƒÂ¨s le premier message sans coÃƒÂ»t d'outil supplÃƒÂ©mentaire.
- **Avantage** : AmÃƒÂ©lioration drastique de la qualitÃƒÂ© perÃƒÂ§ue des rÃƒÂ©ponses initiales du chatbot.
- **RÃƒÂ¨gle** : Toute mise ÃƒÂ  jour de la table `site_summaries` doit s'effectuer via des requÃƒÂªtes SQL/Supabase brutes (conformÃƒÂ©ment ÃƒÂ  l'ADR-004).

---

## ADR 014 : Post-traitement Atomique des Statuts de Crawl & DÃƒÂ©sactivation des Pages Vides
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
La dÃƒÂ©tection des pages vides (`empty`) ou protÃƒÂ©gÃƒÂ©es (`protected`) et la dÃƒÂ©sactivation des cases ÃƒÂ  cocher s'exÃƒÂ©cutaient de maniÃƒÂ¨re itÃƒÂ©rative au sein de la boucle de scan. Cela entraÃƒÂ®nait des clignotements d'interface, des dÃƒÂ©sactivations prÃƒÂ©maturÃƒÂ©es et des conflits d'ÃƒÂ©tat pendant que le crawl ÃƒÂ©tait encore en cours.

### DÃƒÂ©cision
1. **SÃƒÂ©paration Stricte entre Scan et Post-Traitement** : Durant la phase de scan, toutes les pages dÃƒÂ©couvertes restent affichÃƒÂ©es avec le statut `loading` et toutes les URL demeurent sÃƒÂ©lectionnÃƒÂ©es dans `selectedUrls`.
2. **ExÃƒÂ©cution du Marquage uniquement APRÃƒË†S la Fin du Crawl** : Une fois la boucle de scan de toutes les pages 100% terminÃƒÂ©e, une passe de post-traitement vÃƒÂ©rifie le nombre rÃƒÂ©el de morceaux de document enregistrÃƒÂ©s dans Supabase (`documents`).
3. **Mise ÃƒÂ  Jour Atomique** : Les statuts finaux (`loaded`, `empty`, `protected`) et les dÃƒÂ©sactivations de sÃƒÂ©lection sont appliquÃƒÂ©s en une seule mise ÃƒÂ  jour d'ÃƒÂ©tat atomique (`setDiscoveredPages` et `setSelectedUrls`).

### ConsÃƒÂ©quences
- **Avantage** : Ãƒâ€°limination complÃƒÂ¨te des bugs d'affichage et des clignotements de statut durant le crawl.
- **Avantage** : Garantie que les pages ne sont dÃƒÂ©sactivÃƒÂ©es que si et seulement si l'indexation globale du site est totalement achevÃƒÂ©e et vÃƒÂ©rifiÃƒÂ©e en base de donnÃƒÂ©es.

---

## ADR 015 : Bouton d'Ouverture de l'AperÃƒÂ§u dans un Nouvel Onglet
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
Lors de l'utilisation de la modale d'aperÃƒÂ§u plein ÃƒÂ©cran (`showPreviewModal`), l'utilisateur souhaitait avoir la possibilitÃƒÂ© d'ouvrir rapidement le site prÃƒÂ©visualisÃƒÂ© dans un nouvel onglet du navigateur.

### DÃƒÂ©cision
Ajout d'un bouton "Ouvrir dans un nouvel onglet" dans la barre de contrÃƒÂ´le supÃƒÂ©rieure de la modale d'aperÃƒÂ§u (`ClientOnboarding.jsx`). Le bouton s'appuie sur une balise `<a>` avec `target="_blank"`, `rel="noopener noreferrer"`, et comporte l'icÃƒÂ´ne `ExternalLink` issue de `lucide-react`.

### ConsÃƒÂ©quences
- **Avantage** : AccÃƒÂ¨s direct en 1-clic au site web de destination dans un nouvel onglet sans fermer la session de test ou le tableau de bord d'administration.

---

## ADR 016 : ParallÃƒÂ©lisation de l'Ingestion (Batching Client-Side)
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'ingestion des pages web dÃƒÂ©couvertes (crawling) s'effectuait de maniÃƒÂ¨re sÃƒÂ©quentielle (une page ÃƒÂ  la fois) dans `ClientOnboarding.jsx`. Cela rendait le processus trÃƒÂ¨s lent pour les sites contenant beaucoup de pages, car chaque page devait attendre que la prÃƒÂ©cÃƒÂ©dente termine son scan (`/api/start-scan`) avant de commencer.

### DÃƒÂ©cision
1. **Batching Concurrent (Client-Side)** : Le scan des pages a ÃƒÂ©tÃƒÂ© parallÃƒÂ©lisÃƒÂ© dans `runSynchronousCrawlAndIndex` en utilisant `Promise.all` avec un niveau de concurrence (`CONCURRENCY = 5`).
2. **Gestion d'Ãƒâ€°tat SÃƒÂ©curisÃƒÂ©e** : Les mises ÃƒÂ  jour de l'ÃƒÂ©tat React (`setDiscoveredPages`, `setSelectedUrls`) utilisent des fonctions de mise ÃƒÂ  jour fonctionnelles (`prev => ...`) pour garantir qu'aucune donnÃƒÂ©e n'est perdue ou ÃƒÂ©crasÃƒÂ©e lors des retours de promesses concurrentes.

### ConsÃƒÂ©quences
- **Avantage** : AccÃƒÂ©lÃƒÂ©ration massive du temps d'ingestion global du site web lors de l'onboarding.
- **InconvÃƒÂ©nient** : Augmentation du taux de requÃƒÂªtes concurrentes vers notre API et vers Jina Reader (gÃƒÂ©rÃƒÂ© par notre limite de concurrence de 5).

---

## ADR 017 : Refonte du Prompt SystÃƒÂ¨me (Posture Service Client & Liens Directs)
**Date:** 14 AoÃƒÂ»t 2026
**Statut:** AcceptÃƒÂ©

### Contexte
L'assistant IA manquait de consistance dans son rÃƒÂ´le : il ne se positionnait pas toujours comme un vÃƒÂ©ritable membre du service client, et pouvait inviter l'utilisateur ÃƒÂ  "consulter le site web" alors qu'il se trouve dÃƒÂ©jÃƒÂ  dessus. Il fallait ÃƒÂ©galement s'assurer qu'il utilise le "nous" de faÃƒÂ§on stricte.

### DÃƒÂ©cision
Le `systemPrompt` dans `api/chat.js` a ÃƒÂ©tÃƒÂ© entiÃƒÂ¨rement revu pour :
1. Renforcer la posture d'**agent de service client** (intÃƒÂ©gration totale ÃƒÂ  l'ÃƒÂ©quipe, utilisation exclusive de "nous").
2. Interdire formellement les phrases du type "consultez notre site web". S'il faut fournir une information, il la donne ou fournit le lien direct (URL).
3. Bannir le jargon IA ("contexte", "base de donnÃƒÂ©es") pour maintenir l'immersion.
4. Accentuer la prioritÃƒÂ© sur la capture de prospects dÃƒÂ¨s qu'un intÃƒÂ©rÃƒÂªt est montrÃƒÂ© (si activÃƒÂ©).
5. **Valorisation de la marque** : Consigne explicite de vendre poliment les services et de positionner l'entreprise comme premium, de maniÃƒÂ¨re consultative et non agressive.

### ConsÃƒÂ©quences
- **Avantage** : L'expÃƒÂ©rience utilisateur est nettement plus naturelle et professionnelle. Le bot agit comme un vrai employÃƒÂ©.
- **Avantage** : Ãƒâ€°limination des frictions UX (dire d'aller sur le site alors qu'on y est).

## ADR 029: Ajout du Plan Pro Appointment (80$/mois)
### Contexte
Le besoin de gÃ©nÃ©rer des conversions de haute valeur nÃ©cessite de pouvoir lier l'IA Ã  des systÃ¨mes de rÃ©servation (Google Calendar, Calendly) et de notifier le support client.
### DÃ©cision
- Refonte de la page de tarification pour proposer le plan 'Pro Appointment & Support' Ã  80$.
- Ajout des champs \calendar_link\ et \support_email\ dans la base de donnÃ©es (\sites\).
- Mise Ã  jour du systÃ¨me de prompt dynamique pour injecter le lien du calendrier dans les directives de l'agent.
- Ajout d'un outil agentique \send_support_email\ dÃ©clenchÃ© uniquement pour les plans payants.
### ConsÃ©quences
- Le chatbot passe de simple assistant FAQ Ã  un agent de conversion qualifiÃ© capable de booker des rendez-vous sans backend OAuth lourd (en relayant des liens Calendly paramÃ©trables par le client).
- L'injection d'outils est maintenant conditionnÃ©e par le statut de l'abonnement Stripe du client.

## ADR 030: Copilot Admin (Dogfooding) & Page About
### Contexte
Le besoin de prouver la flexibilitÃ© du systÃ¨me et de fournir un assistant 'Copilot' aux administrateurs de la plateforme.
### DÃ©cision
- Injection du chatbot natif dans l'application React \pps/admin/index.html\ avec une clÃ© virtuelle \B2B_ADMIN_COPILOT_KEY\.
- Mise en place d'un pont Ã©vÃ©nementiel global (\window.dispatchEvent('b2b_tool_call')\) dans le widget permettant Ã  la fenÃªtre parente de rÃ©agir aux outils de l'IA sans coupler les deux codebases.
- L'IA peut dÃ©clencher \
avigate_to\ pour changer la vue (dashboard, pricing, leads, about) dans l'application React.
### ConsÃ©quences
- L'utilisateur final (admin) peut utiliser le chatbot pour naviguer dans son propre tableau de bord. Cela dÃ©montre les capacitÃ©s agentiques (Tool Calling -> DOM Action) du produit de faÃ§on spectaculaire.





## ADR : Isolation des données via Utilisateurs Anonymes Supabase
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
La première couche est validée sans modifier l'expérience d'onboarding. Pour isoler réellement les données tout en conservant l'essai immédiat, il est nécessaire d'éviter de forcer une connexion avant le premier scan.

### Décision
Utiliser les utilisateurs anonymes Supabase : un tenant d'essai est lié à cet utilisateur, puis conservé lors de la conversion par e-mail. Les règles RLS (Row Level Security) ont été mises à jour pour lier les tenants à un owner_user_id (auth.users).

### Conséquences
- Isolation des données par utilisateur.
- Maintien de l'expérience d'onboarding sans friction (essai immédiat).


## ADR : Sécurisation des endpoints API Vercel
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Les fonctions serverless (\start-scan.js\, \update-document.js\, \generate-summary.js\) utilisaient la \SUPABASE_SERVICE_ROLE_KEY\ sans vérifier l'identité de l'appelant. Cela permettait à n'importe quel utilisateur non authentifié de modifier ou supprimer les documents de n'importe quel site/tenant.

### Décision
1. Mise en place de \equireAuthentication\ et \equireSiteOwnership\ dans \pi/lib/server-config.js\.
2. Les endpoints API qui modifient des données exigent désormais un header \Authorization: Bearer <token>\ et vérifient que l'utilisateur est bien le propriétaire du \	enant_id\ ET que le \site_id\ appartient bien à ce tenant.
3. \ClientOnboarding.jsx\ envoie maintenant les headers authentifiés lors de ses appels \etch\.
4. L'endpoint cron \cleanup-guests.js\ est sécurisé par un \CRON_SECRET\.

### Conséquences
- Les endpoints backend sont désormais sécurisés contre les accès non autorisés (IDOR).
- L'application est prête et safe pour la production avec de vrais clients.


## ADR : Refactoring architectural (Moteur et Cylindres)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
L'application était plate : un énorme monolithe de 2000 lignes (ClientOnboarding.jsx) et un dossier d'API sans structure métier. Les scripts s'accumulaient sans tri.

### Décision
1. **API** : Regroupées par domaine métier (pi/crawler/, pi/billing/, pi/chat/, pi/cron/).
2. **Scripts** : Triés en sous-dossiers (scripts/tests/, scripts/ops/, scripts/adhoc/).
3. **Frontend** : Création du dossier eatures/dashboard/. Renommage de ClientOnboarding.jsx en Dashboard.jsx. Les APIs fetch ont été mises à jour.

### Conséquences
- Une architecture claire, évolutive et facile à naviguer pour l'équipe de développement.


## ADR : Finalisation du Lancement (Emails, Alertes et LLM Premium)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Nous avions besoin de notifier l'administrateur en cas de plantage système (alertes bug) et de notifier les locataires (tenants) lorsqu'un prospect laissait ses coordonnées sur leur agent (lead alert). Par ailleurs, les forfaits Pro/Enterprise devaient bénéficier d'un modèle plus performant.

### Décision
1. **Librairie Resend** ajoutée et configurée dans \pi/lib/email.js\ pour distribuer les courriels.
2. **Alertes Bug** branchées dans le bloc try/catch global de \pi/chat/index.js\.
3. **Alertes Lead** branchées après l'insertion réussie dans la table \leads\.
4. **Modèles LLM via Env Vars** : \DEFAULT_MODEL\ et \PREMIUM_MODEL\ sont chargés depuis les variables d'environnement. Le LLM Premium (\claude-3.5-sonnet\ par défaut) s'active automatiquement si le \site.tenants.plan\ est \pro\ ou \enterprise\.

### Conséquences
- Une traçabilité parfaite des erreurs système (via courriel) en production.
- Une réactivité accrue pour les leads collectés.
- La monétisation est justifiée par la différence palpable d'intelligence du bot selon le forfait choisi.


## ADR : Résolution des chemins d'importation et validation complète du build
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Lors du build Vercel, l'import `../lib/supabase` dans `src/features/dashboard/Dashboard.jsx` échouait car le composant a été déplacé dans un sous-dossier d'un niveau supplémentaire. De plus, les routes API dans `api/` utilisaient `../../lib/` au lieu de `../lib/` et contenaient des résidus CommonJS (`module.exports`) incompatibles avec le format ES module (`"type": "module"`).

### Décision
1. **Correction des imports Frontend** : Mise à jour de `Dashboard.jsx` pour pointer vers `../../lib/supabase`.
2. **Correction des imports API & Edge functions** : Remplacement des chemins d'accès vers `../lib/` pour tous les sous-dossiers (`api/crawler/`, `api/billing/`, `api/chat/`, `api/cron/`).
3. **Migration ESM des utilitaires** : Conversion des modules `rag-engine.js` et `rate-limiter.js` en ESM (`export default`, `export { ... }`).
4. **Initialisation sécurisée Supabase** : Protection des instanciations `createClient` au niveau racine des fichiers API contre les variables d'environnement manquantes à l'importation.
5. **Suite de tests automatisés** : Ajout du script `test:api` dans `npm test` qui valide systématiquement l'importation de 100% des fichiers de l'API et de ses dépendances.

### Conséquences
- Le build Vite (`npm run build`) passe avec succès sans erreur de résolution.
- Tous les tests de schémas, secrets et imports d'API passent au vert (17/17 routes testées).

## ADR : Consolidation du lien Stripe/Tenant et fiabilisation de l'ajout de sites
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
1. L'erreur `Error: Unable to add this website domain` se produisait de manière opaque dès qu'une session anonyme n'était pas active ou qu'une insertion Supabase échouait, car les exceptions étaient masquées sans retour explicite.
2. Le webhook Stripe et la session de paiement ne synchronisaient pas explicitement le `stripe_customer_id` et le `client_reference_id` avec la table `tenants`.

### Décision
1. **Fiabilisation de `handleAddSite`** :
   - Initialisation automatique / reprise de la session anonyme Supabase si manquante au moment de l'action.
   - Création / récupération du tenant associé à l'utilisateur `auth.users(id)`.
   - Remontée explicite des erreurs SQL / RLS Supabase directement dans l'interface utilisateur pour un diagnostic immédiat.
2. **Synchronisation Stripe ↔ Tenant** :
   - Ajout de `client_reference_id` et des métadonnées de session dans `checkout.js`.
   - Sauvegarde systématique de `stripe_customer_id` et `stripe_subscription_id` dans la table `tenants` dès `checkout.session.completed`.

### Conséquences
- Les erreurs de création de site sont maintenant explicites et guidées.
- Le cycle de facturation Stripe met à jour avec certitude le tenant correspondant.

## ADR : Activation et vérification du Row Level Security (RLS) sur 100% des tables
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Pour garantir une étanchéité absolue des données entre les locataires (tenants) et prévenir toute fuite de données lors des accès clients directs via Supabase Anon Key, toutes les tables de la base de données doivent obligatoirement avoir le RLS activé avec des politiques d'isolation par propriétaire.

### Décision
1. **Migration dédiée `20260820000002_enforce_all_tables_rls.sql`** :
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` activé sur les 9 tables : `tenants`, `sites`, `documents`, `messages`, `leads`, `usage`, `site_summaries`, `usage_counters`, `scan_jobs`.
   - Suppression systématique de toutes les politiques permissives ouvertes (`USING (true)`).
   - Application de politiques strictes `FOR ALL TO authenticated` utilisant `owner_user_id = auth.uid()` ou la fonction sécurisée `current_user_owns_tenant(tenant_id)` (Security Definer).
2. **Consolidation du schéma** : Mise à jour de `consolidated_latest_migrations.sql` pour intégrer ce standard de sécurité de base.

### Conséquences
- Zéro fuite de données possible entre tenants via l'API client Supabase.
- Chaque utilisateur (anonyme ou connecté) ne peut lire, insérer ou modifier que ses propres données.

## ADR : Déverrouillage de l'origine pour les previews et thématisation dynamique complète du chatbot
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
1. L'API de chat (`api/chat/index.js`) bloquait le preview interactif avec l'erreur `Origin non autorisée pour ce site.` car le verrouillage de domaine ne reconnaissait pas les origines de test/preview (Vercel previews `*.vercel.app`, localhost, domaine de l'admin) pour les bots clients.
2. Le panneau de chat (preview et widget externe) avait des éléments codés en dur aux couleurs d'indigo par défaut (bulles utilisateur, bordures, badges, liens) au lieu d'épouser le thème de couleur extrait du site web.

### Décision
1. **Autorisation des origines dans `api/chat/index.js`** :
   - Maintien de l'isolation de sécurité pour les sites clients finaux.
   - Autorisation explicite des environnements d'administration, de preview Vercel (`*.vercel.app`), de `localhost` et de `ADMIN_ALLOWED_ORIGINS` pour tester en direct tous les chatbots depuis le dashboard.
2. **Harmonisation complète du thème du chatbot** :
   - Application de la couleur de marque `themeColor` dynamique sur : l'en-tête du panneau (dégradé subtil), le halo/bordure du modal, les bulles de messages de l'utilisateur, les liens et surlignages de l'assistant, l'indicateur de frappe, le bouton d'envoi et le bouton flottant (launcher).
   - Intégration de variables CSS standardisées (`--b2b-theme`, `--b2b-theme-shadow`, `--b2b-theme-border`, `--b2b-theme-header`) dans le composant widget pour un rendu identique en embarqué.

### Conséquences
- Le test interactif en direct dans le Dashboard fonctionne immédiatement sans erreur 403.
- Le chatbot s'intègre harmonieusement avec l'identité visuelle de chaque site web client.

## ADR : Sécurisation cryptographique de l'origine et protection anti-abus de quota (DDoS / Scraping)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Si l'API de chat autorisait passivement toutes les origines `localhost` ou `*.vercel.app`, un attaquant aurait pu récupérer la `tenant_public_key` publique d'un client et envoyer des requêtes de chat en boucle depuis sa propre machine ou un site externe pour épuiser les crédits IA et le quota du client.

### Décision
1. **Verrouillage strict de domaine par défaut** : Si la requête provient du domaine enregistré du client (`origin === site.domain`), elle est autorisée sans authentification préalable (usage normal du widget par les visiteurs du site).
2. **Authentification cryptographique obligatoire hors-domaine** : Si la requête provient d'une origine différente (comme le Dashboard Admin sur Vercel ou en dev local), l'API `/api/chat` exige impérativement un JWT Supabase valide (`Authorization: Bearer <token>`) ET vérifie que `user.id === tenant.owner_user_id`.
3. **Rejet strict (403)** : Tout appel tiers non authentifié ou provenant d'un utilisateur ne possédant pas le tenant est immédiatement rejeté avec une erreur 403.

### Conséquences
- **Sécurité maximale** : Impossible pour un tiers d'utiliser la clé publique d'un client depuis `localhost`, un script ou un domaine concurrent pour consommer ses crédits.
- **Expérience développeur et preview fluide** : Le propriétaire du bot connecté à son Dashboard peut tester son bot en direct en toute sécurité.

## ADR : Correction du parsing du plan tenant (tenants undefined)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Une erreur d'accès `Cannot read properties of undefined (reading 'tenants')` survenait dans `api/chat/index.js` en raison d'une duplication d'accès imbriqué `site.tenants?.site.tenants?.plan`.

### Décision
- Normalisation de l'extraction de `tenantPlan` gérant à la fois les objets et les tableaux retournés par les jointures Supabase : `const tenantPlan = (Array.isArray(site.tenants) ? site.tenants[0]?.plan : site.tenants?.plan) || 'free';`.
- Réutilisation de `hasProPlan` pour la sélection du modèle LLM et la configuration des intégrations.

### Conséquences
- Plus d'erreur 500 sur l'API de chat.

## ADR : Modernisation du Chatbot en Mode Clair et extraction automatique du thème complet
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Le chatbot avait par défaut un fond sombre/noir avec un contraste inadéquat sur les sites web d'entreprises majoritairement blancs/clairs. De plus, l'appel d'analyse de thème (`/api/chat/theme`) n'extrayait pas la palette visuelle complète (`theme_mode`, `background_color`, `text_color`).

### Décision
1. **Extraction de thème enrichie (`api/chat/theme.js` & `api/lib/llm.js`)** :
   - Détection automatique de la couleur d'accent (`primary_color`), du mode (`theme_mode` : 'light' / 'dark'), de la couleur de fond et du texte.
   - Intégration synchrone lors de l'onboarding pour créer et configurer le site avec la couleur exacte de la marque dès la première seconde.
2. **Refonte UI du Chatbot (Mode Clair Moderne)** :
   - Fond du panneau en blanc pur (`#ffffff`) avec ombre portée douce.
   - En-tête avec dégradé subtil teinté à la couleur de la marque.
   - Bulles de messages de l'assistant blanches avec bordure ardoise légère (`#e2e8f0`) et typographie foncée lisible (`#1e293b`).
   - Bulles utilisateur colorées avec la couleur de marque extraite (`primary_color`) et texte blanc.
   - Champ de saisie blanc/slate-50 avec bordure focalisée coordonnée à la couleur de la marque.
   - Adaptabilité complète dans le composant widget (`widget.css`) via des variables CSS standardisées.

### Conséquences
- Le chatbot s'intègre harmonieusement sur n'importe quel site web blanc ou clair par défaut.

## ADR : Suppression du toggle Desktop/Mobile et affichage natif 100% responsive
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Le commutateur manuel Desktop/Mobile ajoutait de la complexité visuelle inutile dans la modal de prévisualisation du chatbot.

### Décision
- Suppression du toggle Desktop / Mobile et de l'état `previewViewport`.
- La vue de prévisualisation utilise désormais directement l'écran / appareil actuel (`w-full h-full`) pour une expérience fluide et réactive naturelle sur tout appareil (smartphone, tablette ou desktop).

### Conséquences
- Interface de prévisualisation plus épurée et affichage naturel de l'appareil utilisateur.

## ADR : Synchronisation automatique du bundle widget.iife.js dans le pipeline de build
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Le widget réel (`apps/widget/src/widget.css` et `main.js`) était compilé dans `apps/widget/dist/`, mais le fichier distribué `apps/admin/public/widget.iife.js` n'était pas automatiquement régénéré lors du `npm run build`. Par conséquent, le script externe intégrable servait encore l'ancien bundle au fond noir.

### Décision
- Automatisation du pipeline dans `package.json` : `build` compile désormais le workspace `@b2b-ai-chatbot/widget`, copie le bundle généré `widget.iife.js` dans `apps/admin/public/`, puis lance le build de `@b2b-ai-chatbot/admin`.
- Harmonisation complète du mode clair dans `widget.css` : correction des couleurs de texte pour le Markdown (balises strong, h1/h2/h3, code en ligne, formulaire de lead) afin d'assurer un contraste net et lisible.

### Conséquences
- Le vrai script widget `<script src=".../widget.iife.js">` dispose désormais systématiquement de la dernière version à jour avec le thème clair moderne et les couleurs d'accent du site client.

## ADR : Contrôle de zoom et cadrage dynamique pour l'iframe de prévisualisation
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Certains sites web externes possèdent des conteneurs fixes à largeur minimale (ex. 1200px / 1440px) ou des mises en page qui dépassent la largeur disponible de la fenêtre de prévisualisation, entraînant un rognage horizontal.

### Décision
- Ajout d'un système de zoom/échelle fluide (`zoomLevel`) dans la barre supérieure de prévisualisation (boutons Zoom - / Zoom + / Reset 100%).
- Application de la transformation adaptative `scale(${zoomLevel})` et `width: ${100 / zoomLevel}%` sur l'iframe afin de redimensionner n'importe quel site web de manière à ce qu'il rentre à 100% dans l'espace disponible.
- Activation du défilement naturel (`overflow-auto`) dans le conteneur de prévisualisation.

### Conséquences
- L'utilisateur peut ajuster et faire rentrer n'importe quel site web complexe à 100% dans la fenêtre de prévisualisation sans coupure.

## ADR : Cadrage 100% automatique et invisible (Auto-Fit Dynamique par ResizeObserver)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
L'utilisateur a demandé que l'ajustement du site web dans la prévisualisation soit 100% automatique et transparent sans aucun bouton ni contrôle manuel visible pour le client.

### Décision
- Suppression complète des boutons manuels de zoom/échelle dans la barre d'en-tête.
- Implémentation d'un calcul dynamique automatique (`autoScale`) piloté par `ResizeObserver` : dès que la largeur disponible est inférieure à 1280px, l'iframe calcule et applique instantanément le ratio d'échelle parfait (`scale = width / 1280`) avec `transform-origin: top left`.
- L'expérience est 100% transparente et fluide pour le client sur n'importe quel écran.

### Conséquences
- N'importe quel site web (même avec une largeur fixe de 1280px+) rentre automatiquement et parfaitement à 100% dans le cadre du preview sans aucune action de l'utilisateur.

## ADR : Cadrage automatique et suppression des boutons manuels dans preview.html (Open in new tab)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
La page de prévisualisation autonome `preview.html` (accessible via "Open in new tab") contenait encore des contrôles manuels et n'appliquait pas le redimensionnement automatique de l'iframe.

### Décision
- Suppression des sélecteurs manuels de viewport dans la barre supérieure de `preview.html`.
- Implémentation du cadrage automatique par `ResizeObserver` dans `preview.html` (`autoScaleFrame`) : l'iframe est automatiquement adaptée à la largeur de la fenêtre et mise à l'échelle sans aucune coupure.

### Conséquences
- L'affichage dans un nouvel onglet est totalement propre, automatique et sans action manuelle.

## ADR : Optimisation et réduction des dimensions du panneau de chatbot (360px x 500px)
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Le panneau de chat était trop volumineux (380px de large, 600px de hauteur, bouton déclencheur de 60px), ce qui occupait une part disproportionnée de l'écran dans le nouvel onglet (`preview.html`) et sur les écrans standards.

### Décision
- Réduction des dimensions globales vers les standards ergonomiques du marché :
  - Largeur du panneau : **360px** (avec `max-width: calc(100vw - 32px)`).
  - Hauteur du panneau : **500px** (avec `max-height: calc(100vh - 110px)`).
  - Bouton déclencheur flottant : **52px** x **52px** avec icône de 24px.
  - Ajustement des espacements (padding d'en-tête, messages et champ de texte plus compacts et élégants).
- Application synchronisée dans `widget.css`, `ChatPreview.jsx` et `Dashboard.jsx`.

### Conséquences
- Le chatbot s'affiche avec des proportions idéales, fines et non envahissantes sur le site web du client.

## ADR : Intégration d'un CAPTCHA invisible (Cloudflare Turnstile) à l'entrée
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
Pour protéger la plateforme, le processus d'onboarding, et les endpoints publics d'extraction et d'indexation contre le spam de robots et les attaques par déni de service (DOS) sans aucune friction pour les utilisateurs réels.

### Décision
- Intégration de **Cloudflare Turnstile en mode invisible** (`size: 'invisible'`).
- Chargement du script officiel Cloudflare Turnstile dans `apps/admin/index.html`.
- Exécution silencieuse et transparente (`executeTurnstileCaptcha`) lors de la soumission de l'URL sur l'onboarding et l'ajout de sites.
- Création du module de vérification côté backend [`api/lib/captcha.js`](file:///c:/Users/felix/Desktop/Chatbots/Demos/b2b-ai-chatbot/api/lib/captcha.js) validant les jetons avec l'API Cloudflare Turnstile (`siteverify`).
- Protection active sur les endpoints d'entrée (`/api/chat/theme`, `/api/crawler/crawl`).

### Conséquences
- Protection 100% invisible contre les attaques de bots automatisés sans puzzles irritants pour les clients humains.

## ADR : Correction et accessibilité des boutons "Settings" et "Delete Website"
**Date:** 20 Août 2026
**Statut:** Accepté

### Contexte
L'utilisateur a signalé des boutons inactifs ou difficiles d'accès pour l'affichage des paramètres ("Show Settings") et la suppression d'un site web ("Delete Website").

### Décision
- **Accès direct "Settings"** :
  - Ajout d'un bouton d'action directe "Settings" dans la barre principale du site actif dans [`Dashboard.jsx`](file:///c:/Users/felix/Desktop/Chatbots/Demos/b2b-ai-chatbot/apps/admin/src/features/dashboard/Dashboard.jsx) qui ouvre et fait défiler automatiquement jusqu'à la section des paramètres avancés (`#advanced-settings-section`).
  - Sécurisation du bouton accordéon "Show Settings / Hide Settings" avec `type="button"`, `e.preventDefault()`, et gestion explicite de l'état `showAdvancedSettings`.
- **Suppression de site web ("Delete Website")** :
  - Ajout d'un libellé clair "Delete" sur le bouton d'action rapide de la carte du site.
  - Ajout d'un bloc dédié "Danger Zone: Delete Website" dans le panneau des paramètres avancés.
  - Ajout du bouton de suppression avec confirmation dans [`SitesManager.jsx`](file:///c:/Users/felix/Desktop/Chatbots/Demos/b2b-ai-chatbot/apps/admin/src/components/SitesManager.jsx).

### Conséquences
- L'utilisateur peut ouvrir et fermer les paramètres en un clic et supprimer n'importe quel site web de manière fluide avec confirmation de sécurité.
