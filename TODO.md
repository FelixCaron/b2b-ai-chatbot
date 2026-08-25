# TODO

## Sécurité — Authentification et isolation des tenants

- [ ] Remplacer la connexion basée sur l’email et `localStorage` par Supabase Auth (lien magique ou mot de passe).
- [ ] Ajouter un propriétaire authentifié (`owner_user_id`) aux tenants et migrer les tenants existants.
- [x] Faire passer les accès administratifs par des endpoints authentifiés, plutôt que par des écritures directes depuis le navigateur. *(delete-site, checkout, portal, scan, update-document, generate-summary passent tous par `requireSiteOwnership`/`requireTenantOwnership` — 2026-08-25)*
- [ ] Activer des politiques RLS restrictives pour chaque table tenantée (`tenants`, `sites`, `documents`, `messages`, `leads`, `usage`, `site_summaries`, `scan_jobs`).
- [x] Vérifier systématiquement que l’utilisateur authentifié possède le tenant ciblé avant une opération de scan, crawl, édition ou facturation. *(voir ADR 036 et ADR 038)*
- [ ] Activer Supabase Auth et configurer les URL de redirection en production.

## Exploitation

- [ ] Révoquer et remplacer les clés Supabase service-role et Jina précédemment versionnées, puis enregistrer les nouvelles valeurs uniquement dans Vercel/Supabase.

## Priorités issues de la revue — P0

- [x] Protéger les endpoints administratifs par authentification et contrôle de propriété du tenant : `start-scan`/`scan.js`, `update-document`/`update.js`, `generate-summary`/`summarize.js` avaient déjà `requireSiteOwnership` ; `delete-site`, `checkout`, `portal` corrigés le 2026-08-25 (voir ADR 036, ADR 038). `crawl-site`/`crawl.js` et `analyze-theme`/`theme.js` s'exécutent avant qu'un site existe (onboarding) — protégés par captcha Turnstile plutôt que par ownership. `cleanup-guests` reste protégé par `CRON_SECRET` (pas d'utilisateur authentifié dans ce contexte, c'est le bon mécanisme).
- [x] Protéger les fetches sortants contre le SSRF — `api/lib/url-security.js` bloque déjà `http`/`https` uniquement, les identifiants dans l'URL, les IP privées/loopback/link-local (v4 et v6), et revalide chaque redirection. *(Résiduel, non trivial en runtime Edge : pas de résolution DNS préalable pour détecter un DNS rebinding — un hostname public en apparence qui résout vers une IP privée au moment du fetch réel.)*
- [ ] Remplacer ou supprimer `preview-proxy` : il accepte une URL arbitraire, neutralise les protections de framing d’un site tiers, et renvoie du HTML injecté sous l’origine de l’admin. Préférer une capture d’écran externe ou un iframe sandboxé sans proxy HTML.

## Priorités issues de la revue — P1

- [ ] Réparer le contrat de prévisualisation : `apps/admin/public/preview.html` attend `{ canFrame }`, mais `api/preview-proxy.js` renvoie du HTML. Le proxy est actuellement contourné par le fallback.
- [ ] Remplacer la vérification d’origine du chat fondée sur `includes()` par une comparaison stricte de `URL.origin`/hostname et une liste explicite des origines admin autorisées.
- [ ] Mettre une limite distribuée par tenant/IP sur le chat, le crawl et les scans : le `Map` en mémoire Edge ne protège pas entre instances.
- [x] Ajouter `npm run test:secrets` à la CI, afin de bloquer toute nouvelle clé versionnée. *(2026-08-25 — la CI ne tournait plus du tout depuis ~30 commits à cause d'un chemin de script cassé, ce qui faisait aussi sauter silencieusement cette étape ; les deux sont corrigés.)*

## Qualité et maintenance — P2

- [ ] Corriger l’encodage corrompu de certaines sections de `ADR.md`.
- [ ] Réduire les duplications de la logique de chunking entre `start-scan.js`, `update-document.js` et les scripts d’ingestion.

## Administratif — avant d'accepter de vrais clients payants

Ajouté le 2026-08-25 suite à la création des pages `Privacy Policy` / `Terms of Service` (`apps/admin/src/components/LegalPages.jsx`) : ces pages contiennent des placeholders `[entre crochets]` tant que ce qui suit n'est pas réglé.

- [ ] Choisir un nom de produit/marque définitif (le nom actuel « AI Assistant Platform » est un placeholder générique) et vérifier qu'il n'entre pas en conflit avec une marque existante.
- [ ] Enregistrer une entité légale (entreprise individuelle ou société) si ce n'est pas déjà fait, et mettre à jour le nom légal dans `LegalPages.jsx` (recherche `[Legal entity name`).
- [ ] Réserver un nom de domaine définitif et migrer hors de l'URL Vercel temporaire (`admin-seven-alpha-37.vercel.app`) — impacte aussi le lien « Powered by » du widget et les redirections d'authentification Supabase.
- [ ] Mettre en place des adresses email dédiées (actuellement des placeholders `hello@your-domain.com` / `privacy@your-domain.com` dans `Pricing.jsx` et `LegalPages.jsx`).
- [ ] Désigner nommément la personne responsable de la protection des renseignements personnels, tel qu'exigé par la Loi 25 (Québec) — actuellement un placeholder dans `LegalPages.jsx`.
- [ ] Faire réviser `Privacy Policy` et `Terms of Service` par un·e avocat·e avant le premier vrai client payant — le contenu actuel reflète fidèlement les pratiques techniques réelles du produit (sous-traitants, rétention, etc.) mais n'a pas de valeur juridique certifiée.
- [ ] Décider si la TPS/TVQ s'applique aux ventes et configurer Stripe Tax en conséquence (`Pricing.jsx` affiche actuellement des prix sans taxe).
- [ ] Basculer Stripe du mode sandbox/test vers le mode live une fois la vérification d'entreprise complétée côté Stripe, et confirmer que `STRIPE_WEBHOOK_SECRET` en prod correspond bien à l'endpoint live.
- [ ] Définir une politique de remboursement explicite (les CGU actuelles disent « non remboursable sauf obligation légale » par défaut).

## Go-to-market — landing pages par niche

Ajouté le 2026-08-25 suite à la création de la première landing page niche (ostéopathes, `/solutions/osteopathes`, `apps/admin/src/components/OsteopathyLanding.jsx`). Voir ADR 040.

- [ ] Faire tourner l'onboarding réel (coller une vraie URL de clinique dans le flow live) pour obtenir un premier tenant de démo réel et valider la qualité du RAG sur un site réel et connu — je n'ai pas pu l'exécuter moi-même depuis ce sandbox (proxy sortant qui bloque Chromium en prod, Turnstile qui bloque l'appel API direct, aucune clé locale). À faire côté utilisateur, ou en me fournissant des clés de test jetables.
- [ ] Une fois ce tenant de démo réel créé, remplacer l'aperçu de conversation statique de `OsteopathyLanding.jsx` par un vrai embed du widget pointé sur son `public_key` (avec l'accord explicite du·de la propriétaire du site utilisé, avant de publier son nom/site sur une page marketing publique).
- [ ] Si le créneau ostéopathes convertit, répliquer le même gabarit de page pour 2-3 autres niches candidates (cliniques dentaires, esthétique/med-spa, physio-chiro) pour tester en parallèle côté SEO/self-serve.
