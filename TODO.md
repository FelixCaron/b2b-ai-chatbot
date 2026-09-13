# TODO

Ce qui reste à faire, par thème. Ce qui est fait porte une date et reste visible
un moment, puis disparaît — l'historique complet est dans `ADR.md`.

---

## 🟠 Mise en service des deux environnements

*(Les répertoires racines Vercel, longtemps bloquants, sont réglés : les trois
projets s'appellent désormais `dorafi-admin` / `dorafi-staff` / `dorafi-widget`
et pointent sur `dorafi/admin`, `dorafi/staff`, `dorafi/widget`. La production a
été redéployée et vérifiée le 2026-09-12 — les deux déploiements précédents
avaient échoué.)*

Voir `docs/DEPLOYMENT.md` pour la vue d'ensemble et `infra/terraform/README.md`
pour l'ordre exact des opérations — il est important : le premier `apply` touche
la production.

- [ ] **Fournir les quatre secrets que Terraform ne peut pas retrouver seul** :
      `OPENROUTER_API_KEY`, `JINA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`.
      Vercel les marque « sensibles » et refuse de les relire, y compris à un
      jeton d'API. Sans eux, laisser Terraform gérer les variables d'environnement
      **supprimerait** celles qu'il ne connaît pas et casserait la production.
      C'est le seul vrai blocage avant un `terraform apply` complet.
- [ ] Lancer `terraform apply` **depuis ta machine**, pas depuis une session
      Claude Code : le proxy y bloque toutes les routes d'API GitHub Actions et
      Environments, en lecture comme en écriture, quel que soit le jeton
      (vérifié le 2026-09-13). Les parties Vercel et Supabase, elles, passent.
- [ ] `terraform import` des projets existants (ids ci-dessous), puis
      `terraform plan` jusqu'à ce qu'il n'annonce **aucune** destruction :
      `dorafi-admin` = `prj_MI45o3kUhwE4RqRRcZUyVEhKSrWZ`,
      `dorafi-staff` = `prj_lqAXf1wEdimGtxt8aqDFeNkHGE2A`,
      `dorafi-widget` = `prj_lIDHJ22MoFKthvnn3uFgudoeVH1V`,
      Supabase production = `xuvueegdokgiyedwvmkm` (org `frcollnxlzqgussqqsmi`,
      région `ca-central-1`).
- [ ] DNS : `preview.dorafi.logafi.com` et `preview.logafi.com` vers Vercel.
- [ ] Créer le projet Vercel `logafi` (le seul des quatre qui n'existe pas encore)
      et y rattacher `logafi.com` + `www.logafi.com`. **`logafi.com` ne résout pas
      du tout aujourd'hui** — le domaine n'est pointé nulle part.
- [ ] Stripe : rejouer `npm run setup:stripe` avec une clé **test** pour obtenir
      les trois `STRIPE_PRICE_ID_*` de l'environnement preview, et déclarer un
      endpoint webhook distinct sur `preview.dorafi.logafi.com/api/billing/webhook`
      (son secret de signature n'est pas le même qu'en production).
- [ ] Turnstile : soit une clé de site valide pour les domaines preview, soit
      laisser les clés de test explicites que Terraform pose par défaut.
- [ ] Après le premier `apply` : vérifier dans Vercel → Domains que
      `preview.dorafi.logafi.com` est bien classé **Preview** et non Production.
- [ ] Une fois qu'un déploiement via GitHub Actions a réussi de bout en bout,
      basculer `vars.DEPLOY_PIPELINE_ENABLED` à `true` et couper l'auto-déploiement
      git de Vercel (`create_deployments = false`) — dans cet ordre, pas l'inverse.

## 🟡 Sécurité et isolation des tenants

- [ ] Remplacer la connexion basée sur l'email et `localStorage` par Supabase Auth complet (lien magique ou mot de passe).
- [ ] Ajouter un propriétaire authentifié (`owner_user_id`) aux tenants restants et migrer les tenants existants.
- [ ] Activer des politiques RLS restrictives pour chaque table tenantée (`tenants`, `sites`, `documents`, `messages`, `leads`, `usage`, `site_summaries`, `scan_jobs`).
- [ ] Activer Supabase Auth et configurer les URL de redirection en production *(Terraform les pose désormais via `supabase_settings` — reste à confirmer sur le projet importé)*.
- [ ] Mettre une limite distribuée par tenant/IP sur le chat, le crawl et les scans : le `Map` en mémoire Edge ne protège pas entre instances.
- [ ] Révoquer et remplacer les clés Supabase service-role et Jina précédemment versionnées, puis n'enregistrer les nouvelles valeurs que dans Vercel/Supabase.
- [ ] Décider de la visibilité du dépôt GitHub — il est **public** aujourd'hui : code, ADR, ce fichier, et les notes juridiques sont lisibles par n'importe qui. Si c'est voulu, rien à faire ; sinon Settings → Danger Zone. À noter : les règles d'approbation d'environnement GitHub utilisées par le pipeline sont gratuites sur un dépôt public, payantes sur un dépôt privé.

**Résiduel connu, non trivial** : `api/_lib/url-security.js` bloque bien les IP
privées et revalide chaque redirection, mais ne fait pas de résolution DNS
préalable — un hostname public en apparence qui résout vers une IP privée au
moment du fetch (DNS rebinding) passerait.

## 🟡 Infrastructure — plan Vercel Hobby (12 fonctions par déploiement)

Le projet `dorafi-admin` est à exactement 12/12, vérifié sur un vrai
`vercel build` le 2026-09-12. Attention : Vercel transforme **chaque** fichier
`.js` sous `api/` en fonction, y compris les modules partagés — c'est pourquoi
ils vivent dans `api/_lib/` (le préfixe `_` les exclut). Avec `api/lib/`, la
construction produisait 21 fonctions et le déploiement était refusé.

- [ ] **Restaurer `api/cron/cleanup.js`** (et son contrat `cron.cleanup`) dès qu'un
      slot est libre — sans lui, les tenants invités abandonnés et leurs comptes
      anonymes ne sont plus purgés après 24 h.
- [ ] Passer en plan Pro au premier client payant : supprime la limite, et
      débloque au passage les *Custom Environments* (un environnement `preview`
      natif, plus propre que l'alias actuel).
- [ ] Indépendamment du plan : consolider les endpoints par famille
      (`api/billing/*` → 1 fichier, etc.) avec des rewrites internes. C'est la
      solution durable, qui évite de retomber sur la limite à chaque route.

## 🟢 Qualité et maintenance

- [ ] Réduire la duplication de la logique de chunking entre `crawler/scan.js`, `crawler/update.js` et les scripts d'ingestion.
- [ ] `Dashboard.jsx` garde une table locale `siteActiveOverrides` pour l'affichage immédiat, parce que `sites` appartient à `App.jsx` et n'est pas rechargé après une écriture directe. À effondrer si on retouche ce flux de données.
- [ ] Publier `docs/user-flow-automaton.html` comme Artifact, et surtout le re-vérifier : ses 168 transitions ont été validées le 2026-09-06, donc **avant** l'ADR 058 (essai sans carte, statut `trialing`) et avant la réorganisation du dépôt.
- [ ] Rejouer à la main le parcours invité → email déjà enregistré : il traverse un aller-retour par courriel qu'aucun test local ne couvre. Bloqué tant que le domaine d'envoi n'est pas vérifié chez Resend (voir ci-dessous).
- [ ] Vérifier que toutes les migrations de `supabase/migrations/` sont réellement appliquées en production — l'historique du 2026-09-06 mentionne une migration commitée mais jamais appliquée, et le workflow qui les applique automatiquement n'existe que depuis.

## 🟢 Administratif — avant d'accepter de vrais clients payants

Ces points bloquent des placeholders `[entre crochets]` dans
`dorafi/admin/src/components/LegalPages.jsx`.

- [ ] Enregistrer une entité légale sous le nom « Dorafi » (ou confirmer le nom après une vraie recherche de marque) et mettre à jour le nom légal dans `LegalPages.jsx`.
- [ ] Mettre en place les adresses dédiées (`hello@`, `privacy@`) — aujourd'hui des placeholders dans `Pricing.jsx` et `LegalPages.jsx`.
- [ ] Vérifier le domaine d'envoi chez Resend pour que `noreply@dorafi.logafi.com` délivre réellement ; sans ça seul `caron.felix2@gmail.com` reçoit quoi que ce soit, ce qui bloque tout test d'inscription avec une autre adresse.
- [ ] Désigner nommément la personne responsable de la protection des renseignements personnels (Loi 25, Québec) — placeholder aujourd'hui.
- [ ] Faire réviser `Privacy Policy` et `Terms of Service` par un·e avocat·e. Le contenu décrit fidèlement les pratiques techniques réelles, mais n'a aucune valeur juridique certifiée.
- [ ] Décider si la TPS/TVQ s'applique et configurer Stripe Tax (`Pricing.jsx` affiche des prix hors taxe).
- [ ] **`STRIPE_WEBHOOK_SECRET` n'existe pas dans le projet Vercel de production.**
      `api/billing/webhook.js` le lit pour vérifier la signature Stripe : sans lui,
      le webhook rejette tout, donc **aucun paiement ne met à jour le forfait du
      client**. Constaté le 2026-09-12 en listant les variables du projet.
- [ ] Basculer Stripe du mode sandbox au mode live une fois la vérification d'entreprise faite, et confirmer que `STRIPE_WEBHOOK_SECRET` correspond bien à l'endpoint live.
- [ ] Définir une politique de remboursement explicite (les CGU disent « non remboursable sauf obligation légale » par défaut).

## 🟢 Société mère — site `logafi`

- [ ] Créer la boîte `hello@logafi.com` (MX du domaine) — l'adresse est déjà affichée sur la page et dans son JSON-LD ; sans boîte, les courriels rebondissent.
- [ ] Relire le contenu : services offerts, formulation de la certification *SnowPro Advanced: Architect*, et décider si l'entité légale (`18219184 Canada Inc.`) doit y figurer.
- [ ] Décider si le widget Dorafi est installé sur `logafi.com` (dogfooding) — il faudrait d'abord un tenant et un site dédiés, sinon l'assistant répondrait à partir du contenu de Dorafi.

## 🟢 Go-to-market — landing pages par niche

- [ ] Faire tourner l'onboarding réel sur une vraie URL de clinique pour obtenir un premier tenant de démo et juger la qualité du RAG sur un site connu.
- [ ] Une fois ce tenant créé, remplacer l'aperçu statique de `OsteopathyLanding.jsx` par un vrai embed pointé sur son `public_key` — avec l'accord explicite du·de la propriétaire du site avant de publier son nom sur une page publique.
- [ ] Si le créneau ostéopathes convertit, répliquer le gabarit pour 2-3 autres niches (dentaire, esthétique/med-spa, physio-chiro).

---

## Fait récemment

- [x] **Deux environnements et un pipeline de déploiement** *(2026-09-12)* — base Supabase preview, domaines `preview.*`, et GitHub Actions comme seul chemin vers un déploiement, avec la production derrière une approbation. Voir `docs/DEPLOYMENT.md`.
- [x] **Une arborescence qui dit la vérité** *(2026-09-12)* — un dossier par déployable, plus rien de déployable à la racine.
- [x] **Page et projet Vercel de la société mère `logafi`** *(2026-09-12)*.
- [x] Protéger les endpoints administratifs par authentification et contrôle de propriété du tenant *(2026-08-25 ; voir ADR 036 et 038)*.
- [x] Protéger les fetches sortants contre le SSRF *(`api/_lib/url-security.js`)*.
- [x] Supprimer `preview-proxy`, qui acceptait une URL arbitraire et renvoyait du HTML tiers sous l'origine de l'admin *(2026-09-08)*.
- [x] Ajouter `npm run test:secrets` à la CI *(2026-08-25)*.
- [x] Limites de forfaits appliquées côté base (trigger `sites_enforce_limit`) et non plus seulement dans l'interface *(voir ADR 057)*.
- [x] Rebrand « Repondo » → « Dorafi » et migration hors de l'URL Vercel temporaire vers `dorafi.logafi.com` *(2026-09-06 / 2026-09-07)*.
- [x] Corriger l'encodage corrompu d'`ADR.md` *(2026-09-12)*.
