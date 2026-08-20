# TODO

## Sécurité — Authentification et isolation des tenants

- [ ] Remplacer la connexion basée sur l’email et `localStorage` par Supabase Auth (lien magique ou mot de passe).
- [ ] Ajouter un propriétaire authentifié (`owner_user_id`) aux tenants et migrer les tenants existants.
- [ ] Faire passer les accès administratifs par des endpoints authentifiés, plutôt que par des écritures directes depuis le navigateur.
- [ ] Activer des politiques RLS restrictives pour chaque table tenantée (`tenants`, `sites`, `documents`, `messages`, `leads`, `usage`, `site_summaries`, `scan_jobs`).
- [ ] Vérifier systématiquement que l’utilisateur authentifié possède le tenant ciblé avant une opération de scan, crawl, édition ou facturation.
- [ ] Activer Supabase Auth et configurer les URL de redirection en production.

## Exploitation

- [ ] Révoquer et remplacer les clés Supabase service-role et Jina précédemment versionnées, puis enregistrer les nouvelles valeurs uniquement dans Vercel/Supabase.

## Priorités issues de la revue — P0

- [ ] Protéger les endpoints administratifs par authentification et contrôle de propriété du tenant : `start-scan`, `update-document`, `generate-summary`, `crawl-site`, `analyze-theme`, les endpoints Stripe et `cleanup-guests`.
- [ ] Protéger les fetches sortants contre le SSRF : n’accepter que `http`/`https`, résoudre et refuser les IP privées/réservées, revalider chaque redirection, borner taille et durée des réponses.
- [ ] Remplacer ou supprimer `preview-proxy` : il accepte une URL arbitraire, neutralise les protections de framing d’un site tiers, et renvoie du HTML injecté sous l’origine de l’admin. Préférer une capture d’écran externe ou un iframe sandboxé sans proxy HTML.

## Priorités issues de la revue — P1

- [ ] Réparer le contrat de prévisualisation : `apps/admin/public/preview.html` attend `{ canFrame }`, mais `api/preview-proxy.js` renvoie du HTML. Le proxy est actuellement contourné par le fallback.
- [ ] Remplacer la vérification d’origine du chat fondée sur `includes()` par une comparaison stricte de `URL.origin`/hostname et une liste explicite des origines admin autorisées.
- [ ] Mettre une limite distribuée par tenant/IP sur le chat, le crawl et les scans : le `Map` en mémoire Edge ne protège pas entre instances.
- [ ] Ajouter `npm run test:secrets` à la CI, afin de bloquer toute nouvelle clé versionnée.

## Qualité et maintenance — P2

- [ ] Corriger l’encodage corrompu de certaines sections de `ADR.md`.
- [ ] Réduire les duplications de la logique de chunking entre `start-scan.js`, `update-document.js` et les scripts d’ingestion.
