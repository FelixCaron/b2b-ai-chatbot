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
