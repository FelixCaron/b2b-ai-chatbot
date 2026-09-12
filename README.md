# Dorafi

Un assistant conversationnel B2B multi-tenant. Un client colle l'URL de son
site, le produit le lit, l'indexe, et lui rend un widget JavaScript à coller sur
ses pages qui répond aux visiteurs à partir de ce contenu — et capture les
prospects au passage.

Dorafi est édité par **logafi**, dont le site vit dans ce même dépôt.

## Le dépôt

Un dossier par chose déployable, et le nom du dossier est le nom du projet
Vercel qui le sert. La racine ne déploie rien.

| Dossier | Projet Vercel | Ce que c'est |
|---|---|---|
| `dorafi/admin` | `dorafi-admin` | Le produit : le SPA React **et** ses fonctions serverless (`dorafi/admin/api/**`) |
| `dorafi/staff` | `dorafi-staff` | Console interne inter-tenants. Jamais liée depuis le produit |
| `dorafi/widget` | `dorafi-widget` | Le widget embarquable, bundle IIFE autonome |
| `logafi` | `logafi` | Le site de la société mère. Aucun build : le dossier est servi tel quel |

Et ce qui est partagé : `packages/contracts` (les contrats d'API, importés par
les handlers **et** par les clients navigateur), `packages/shared` (schémas Zod
et types), `supabase/migrations` (SQL brut), `infra/terraform` (les deux
environnements), `tests/e2e` (Playwright), `scripts/`, `docs/`.

## Démarrer

```bash
npm install
npm run dev        # tous les serveurs de dev
npm test           # les 9 suites unitaires
npm run test:e2e   # Playwright
```

Il faut un `.env.local` par app — voir `.env.example`, et `docs/SETUP_CHECKLIST.md`
pour monter un environnement complet de zéro.

## Où va le code quand on pousse

Un push sur `main` ne va **pas** directement en production. Il passe par :

```
CI → migrations preview → déploiement preview → smoke test
   → [ton approbation] → migrations prod → déploiement prod
```

Les domaines `preview.dorafi.logafi.com` et `preview.logafi.com` sont servis par
une **base de données distincte** de la production. Le détail est dans
`docs/DEPLOYMENT.md` ; l'infrastructure elle-même est décrite dans
`infra/terraform/`.

## Pour lire la suite

| | |
|---|---|
| `CLAUDE.md` | Les règles d'architecture et les invariants à ne pas casser |
| `docs/ARCHITECTURE.md` | La carte des composants et des contrats d'API |
| `docs/DEPLOYMENT.md` | Les environnements, le pipeline, comment revenir en arrière |
| `docs/SETUP_CHECKLIST.md` | Monter un environnement de zéro |
| `ADR.md` | Le journal des décisions, du plus récent au plus ancien |
| `TODO.md` | Ce qui reste, par priorité |
