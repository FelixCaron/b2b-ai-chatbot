// French translations for the modals area. English string → French.
// Keys are the exact English source strings passed to t(); {tokens} are
// interpolation placeholders and must be preserved verbatim in the French.
export default {
  // AddSiteModal
  'Add a New Website': 'Ajouter un nouveau site Web',
  'Connect another website to your account without interrupting your active assistant.':
    'Connectez un autre site Web à votre compte sans interrompre votre assistant actif.',
  'Website URL / Domain': 'URL ou domaine du site Web',
  'Cancel': 'Annuler',
  'Adding & Learning...': 'Ajout et apprentissage...',
  'Add & Learn Website →': 'Ajouter et apprendre le site →',

  // DeleteSiteModal
  'Delete Website?': 'Supprimer le site Web?',
  'Are you sure you want to delete': 'Êtes-vous sûr de vouloir supprimer',
  '? Everything your assistant learned from it, and the code installed on your website, stop working permanently.':
    "? Tout ce que votre assistant en a appris, ainsi que le code installé sur votre site Web, cesseront de fonctionner définitivement.",
  'Deleting...': 'Suppression...',
  'Retry Delete': 'Réessayer la suppression',
  'Delete Permanently': 'Supprimer définitivement',

  // EditPageModal
  'Edit what this page tells your assistant': 'Modifier ce que cette page indique à votre assistant',
  'Save Changes': 'Enregistrer les modifications',

  // IntegrationModal
  'Add your assistant to your website': 'Ajoutez votre assistant à votre site Web',
  'Copy this code snippet and paste it right before the closing':
    "Copiez cet extrait de code et collez-le juste avant la balise de fermeture",
  'tag on any pages where you want the assistant to appear.':
    "sur toutes les pages où vous souhaitez que l'assistant apparaisse.",
  'Plan Limit Exceeded ({count} / {max} pages)': 'Limite du forfait dépassée ({count} / {max} pages)',
  'Your website has': 'Votre site Web compte',
  '{n} active pages': '{n} pages actives',
  ', which exceeds your current': ', ce qui dépasse la limite actuelle de votre forfait',
  'plan limit of': 'fixée à',
  '{n} pages': '{n} pages',
  'To deploy to your live website, either': 'Pour déployer sur votre site Web en ligne, vous devez soit',
  'upgrade your plan': 'mettre à niveau votre forfait',
  'or': 'soit',
  'remove {n} page(s)': 'supprimer {n} page(s)',
  'from your website content list.': 'de la liste de contenu de votre site Web.',
  'Manage & Deactivate Pages': 'Gérer et désactiver des pages',
  'Upgrade Plan →': 'Mettre à niveau le forfait →',
  'Copied': 'Copié',
  'Copy Code': 'Copier le code',
  'How to install on my platform': 'Comment installer sur ma plateforme',
  'Installation detected': 'Installation détectée',
  'Checking installation...': "Vérification de l'installation...",
  'Done': 'Terminé',

  // IntegrationModal — PLATFORM_GUIDES (install steps)
  'Generic / raw HTML': 'Générique / HTML brut',
  'Install a header/footer script plugin, e.g. "WPCode" or "Insert Headers and Footers" (Plugins → Add New).':
    'Installez une extension d\'en-tête/pied de page comme « WPCode » ou « Insert Headers and Footers » (Extensions → Ajouter).',
  "Open the plugin's Footer scripts field.": "Ouvrez le champ des scripts de pied de page de l'extension.",
  'Paste the snippet in the footer field and save/publish.':
    "Collez l'extrait de code dans le champ de pied de page, puis enregistrez ou publiez.",
  'No plugin allowed? Ask your host or theme developer to add it to footer.php, just before </body>.':
    "Les extensions ne sont pas autorisées? Demandez à votre hébergeur ou au développeur de votre thème de l'ajouter dans footer.php, juste avant </body>.",
  'Go to your site Dashboard → Settings → Custom Code (under "Advanced").':
    'Accédez au tableau de bord de votre site → Paramètres → Code personnalisé (sous « Avancé »).',
  'Click "+ Add Custom Code" and paste the snippet.':
    "Cliquez sur « + Ajouter du code personnalisé » et collez l'extrait de code.",
  'Set "Add Code to Pages" to All Pages, and "Place Code in" to Body - end.':
    'Réglez « Ajouter le code aux pages » sur Toutes les pages, et « Emplacement du code » sur Corps - fin.',
  'Click Apply, then publish your site.': 'Cliquez sur Appliquer, puis publiez votre site.',
  'Go to Settings → Advanced → Code Injection.': 'Accédez à Paramètres → Avancé → Injection de code.',
  'Paste the snippet into the Footer box — this applies it to every page automatically.':
    "Collez l'extrait de code dans la zone Pied de page — il s'appliquera automatiquement à toutes les pages.",
  'Save, then make sure your site is published.': 'Enregistrez, puis assurez-vous que votre site est publié.',
  'Note: Code Injection needs a Business or Commerce plan.':
    "Remarque : l'injection de code nécessite un forfait Business ou Commerce.",
  'Go to Online Store → Themes, then click "Edit code" on your live theme.':
    'Accédez à Boutique en ligne → Thèmes, puis cliquez sur « Modifier le code » sur votre thème en ligne.',
  'Open theme.liquid under the Layout folder.': 'Ouvrez theme.liquid dans le dossier Layout.',
  'Paste the snippet right before the closing </body> tag.':
    "Collez l'extrait de code juste avant la balise de fermeture </body>.",
  'Save the file.': 'Enregistrez le fichier.',
  "Open the HTML file(s) for your site, or your builder's page/template editor.":
    "Ouvrez le ou les fichiers HTML de votre site, ou l'éditeur de pages/modèles de votre outil de création.",
  'Find the closing </body> tag near the bottom of the file.':
    'Repérez la balise de fermeture </body> vers la fin du fichier.',
  'Paste the snippet immediately before </body>.': "Collez l'extrait de code immédiatement avant </body>.",
  'Repeat on every page where the assistant should appear, then re-upload or publish.':
    "Répétez l'opération sur chaque page où l'assistant doit apparaître, puis retéléversez ou publiez.",

  // LearningProgressModal
  '🎉 Your assistant is ready!': '🎉 Votre assistant est prêt!',
  'Learning {domain}': 'Apprentissage de {domain}',
  'your website': 'votre site Web',
  "We've read your website and your assistant is ready to answer questions about it.":
    'Nous avons parcouru votre site Web et votre assistant est prêt à répondre aux questions à son sujet.',
  "We're reading your pages and learning what your business does, so your assistant can answer visitors around the clock.":
    'Nous parcourons vos pages et apprenons ce que fait votre entreprise, afin que votre assistant puisse répondre aux visiteurs en tout temps.',
  'Reading your website...': 'Lecture de votre site Web...',
  'Ask it something one of your visitors would ask — that is the fastest way to see what it knows, and to spot anything worth correcting before it goes on your website.':
    "Posez-lui une question qu'un de vos visiteurs poserait — c'est le moyen le plus rapide de voir ce qu'il sait, et de repérer ce qui mérite d'être corrigé avant qu'il n'arrive sur votre site web.",
  'So nothing your visitors ask about is missing': "Pour qu'il ne manque rien de ce que vos visiteurs demandent",
  'Services, prices, hours, policies — in your own words': 'Services, prix, horaires, politiques — dans vos propres mots',
  'So its answers sound like your business, not a generic bot':
    "Pour que ses réponses ressemblent à votre entreprise, pas à un robot générique",
  'Finding your pages': 'Recherche de vos pages',
  'Reading what each page says': 'Lecture du contenu de chaque page',
  'Learning what your business does': 'Apprentissage de ce que fait votre entreprise',
  'Test your assistant →': 'Tester votre assistant →',
  'Go to Dashboard': 'Aller au tableau de bord',
  'Please keep this window open while we finish reading your website...':
    'Veuillez garder cette fenêtre ouverte pendant que nous terminons la lecture de votre site Web...',

  // LivePreviewModal
  'Back to Dashboard': 'Retour au tableau de bord',
  'Back': 'Retour',
  'Open the live site in a new tab': 'Ouvrir le site en ligne dans un nouvel onglet',
  'Open live site': 'Ouvrir le site en ligne',
  'Assistant preview for {domain}': "Aperçu de l'assistant pour {domain}",

  // OverLimitModal
  'Choose which websites stay active': 'Choisissez les sites Web qui restent actifs',
  'Choose which website stays active': 'Choisissez le site Web qui reste actif',
  'Your': 'Votre forfait',
  'plan covers': 'couvre',
  '{n} active websites': '{n} sites Web actifs',
  '{n} active website': '{n} site Web actif',
  ', and you have': ', et vous en avez',
  'The websites you do not select are': 'Les sites Web que vous ne sélectionnez pas sont',
  'parked, not deleted': 'mis en pause, pas supprimés',
  '. Everything they learned, and every lead they captured, stays exactly where it is — they simply stop answering visitors. Upgrade your plan and they come back online exactly as they were.':
    ". Tout ce qu'ils ont appris, ainsi que chaque prospect capté, reste exactement là où il est — ils cessent simplement de répondre aux visiteurs. Mettez à niveau votre forfait et ils reviennent en ligne exactement comme avant.",
  'Unselect another website first': "Désélectionnez d'abord un autre site Web",
  'Stays online': 'Reste en ligne',
  'Parked': 'En pause',
  'Stays active': 'Reste actif',
  'Will be parked': 'Sera mis en pause',
  'Upgrade instead and keep all {n} online →': 'Mettre à niveau plutôt et garder les {n} en ligne →',
  'Saving...': 'Enregistrement...',
  'Keep selected active & park {n} →': 'Garder la sélection active et mettre {n} en pause →',

  // PageSelectionModal
  'No pages match your search.': 'Aucune page ne correspond à votre recherche.',
  'Selected': 'Sélectionnée',
  'Skipped': 'Ignorée',
  'Your plan allows up to {n} pages. Please upgrade or uncheck another page.':
    'Votre forfait permet jusqu\'à {n} pages. Veuillez mettre à niveau ou décocher une autre page.',
  'Large Website ({n} Pages Discovered)': 'Grand site Web ({n} pages découvertes)',
  'Your current': 'Votre forfait actuel',
  'plan includes up to': "inclut jusqu'à",
  "— we've pre-selected the first {n} below. Confirm as-is, search to swap in specific pages instead,":
    '— nous avons présélectionné les {n} premières ci-dessous. Confirmez tel quel, ou effectuez une recherche pour choisir des pages précises,',
  ' or contact us for a custom plan': ' ou contactez-nous pour un forfait personnalisé',
  ' or upgrade your plan': ' ou mettez à niveau votre forfait',
  '{n} / {max} pages selected': '{n} / {max} pages sélectionnées',
  'Filter pages by URL or title...': 'Filtrer les pages par URL ou titre...',
  'Select Top {n}': 'Sélectionner les {n} premières',
  'Clear All': 'Tout effacer',
  'This site has more than {n} pages — bigger than any of our plans are sized for, so we only scanned the first {n}.':
    'Ce site compte plus de {n} pages — plus grand que ce que nos forfaits couvrent, nous avons donc seulement analysé les {n} premières.',
  'Contact us': 'Nous contacter',
  'for a custom plan sized to your site.': 'pour un forfait personnalisé adapté à votre site.',
  'Contact us for a custom plan →': 'Nous contacter pour un forfait personnalisé →',
  'Confirm & Index Selected Pages ({n}) →': 'Confirmer et indexer les pages sélectionnées ({n}) →',

  // ResetSiteModal
  'Reset {domain}?': 'Réinitialiser {domain}?',
  'This clears everything your assistant has learned from this website — every indexed page and its business summary — and every customization: tone, goal, lead capture, integrations, widget color, and favicon. It then re-detects your brand and starts a fresh scan right away. Your install code, leads, and conversation history are not affected.':
    "Ceci efface tout ce que votre assistant a appris de ce site Web — chaque page indexée et son résumé d'entreprise — ainsi que toutes les personnalisations : ton, objectif, capture de prospects, intégrations, couleur du widget et favicon. Le système redétecte ensuite votre marque et lance immédiatement une nouvelle analyse. Votre code d'installation, vos prospects et votre historique de conversations ne sont pas touchés.",
  'Reset & Re-scan': "Réinitialiser et relancer l'analyse",

  // ActivationRequiredModal
  'Activate your assistant on {domain}': 'Activez votre assistant sur {domain}',
  'your assistant': 'votre assistant',
  'Building, testing and installing your assistant are free. An active plan is what makes it actually appear for your visitors — until then, the code you pasted stays invisible on your website.':
    "Créer, tester et installer votre assistant est gratuit. C'est un forfait actif qui le fait réellement apparaître pour vos visiteurs — d'ici là, le code que vous avez collé reste invisible sur votre site Web.",
  'See Plans →': 'Voir les forfaits →',
  'Go back': 'Retour',

  // IntegrationModal — activation banner
  'Paste it now — activate when you are ready': 'Collez-le maintenant — activez quand vous voulez',
  'This code is yours to install right away. Your assistant stays invisible to your visitors until your workspace has an active plan — nothing else to change once it does.':
    "Ce code est à vous, installez-le tout de suite. Votre assistant reste invisible pour vos visiteurs tant que votre espace de travail n'a pas de forfait actif — et rien d'autre ne sera à changer une fois que ce sera fait.",
  'Activate my assistant →': 'Activer mon assistant →',

  // UpgradeRequiredModal
  'Add {domain} with an upgrade': 'Ajoutez {domain} avec une mise à niveau',
  'another website': 'un autre site Web',
  '{n} websites': '{n} sites Web',
  '{n} website': '{n} site Web',
  ', and your workspace already has {n}.': ', et votre espace de travail en compte déjà {n}.',
  'Upgrading to': 'Passer à',
  'raises that to': 'fait passer cette limite à',
  ' — your current assistants keep running exactly as they are.':
    ' — vos assistants actuels continuent de fonctionner exactement comme avant.',
  'That is our largest plan; get in touch and we will work out what you need.':
    "Il s'agit de notre forfait le plus élevé. Contactez-nous et nous trouverons ensemble ce qu'il vous faut.",
  'Upgrade to {name}': 'Mettre à niveau vers {name}',
  'See plans': 'Voir les forfaits',
  'Or delete {domain} to free a slot': 'Ou supprimez {domain} pour libérer une place',
  'an existing website': 'un site Web existant',
  'Not now': 'Pas maintenant',
};
