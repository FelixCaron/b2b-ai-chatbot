# B2B AI Chatbot - Architecture Decision Records (ADR)

Ce document retrace toutes les décisions importantes concernant l'architecture, le flux utilisateur et le design de l'application, afin d'éviter les régressions futures.

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

