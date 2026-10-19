# Tom Photo — React et Vite

Cette application est indépendante du site HTML existant. Elle utilise React avec Vite pour les pages publiques et un serveur Express avec SQLite pour les contenus, les fichiers et l’espace administrateur.

## Démarrage local

1. Installer Node.js 20 ou plus récent.
2. Depuis ce dossier, lancer `npm install`.
3. Copier `.env.example` vers `.env`.
4. Créer le compte administrateur avec `npm run setup:admin`. Le mot de passe est saisi sans être affiché; la commande remplace les valeurs admin de `.env` en conservant les autres paramètres.
5. Renseigner les paramètres SMTP dans `.env` pour activer l’envoi réel des demandes.
6. Lancer `npm run dev`, puis ouvrir l’adresse Vite affichée dans le terminal. Le site et l’API démarrent ensemble.
7. Ouvrir le lien « Espace administrateur » en bas du site, ou aller directement sur `http://127.0.0.1:5175/admin`.

En développement, Vite utilise le port `5175` et l’API Express le port `5174`. Ces ports sont séparés volontairement : si le port `5175` est déjà occupé, arrêtez l’autre serveur Vite avant de relancer `npm run dev`. L’API autorise les origines de développement Vite sur les ports `5173` et `5175`.

Le menu burger contient un accès « Espace administrateur »; la page reste protégée par les identifiants administrateur. Le tableau de bord permet de modifier les textes publics, les images et vidéos, les prestations, les tarifs, les horaires indicatifs, les coordonnées, les liens du menu et des réseaux sociaux, ainsi que le pied de page. Dans « Galerie », les catégories/albums sont configurables et plusieurs photos peuvent être importées directement dans l’album choisi; jusqu’à 120 photos et 24 catégories sont prises en charge. Faites glisser les catégories pour changer leur ordre sur le site; faites glisser les photos pour les réordonner, ou utilisez leurs flèches pour les déplacer une par une. Chaque photo peut être regroupée dans un « sous-groupe » (par exemple « Portrait seul », « Portrait duo », « Portrait famille » au sein de la catégorie « Portrait », ou « Drone » et « Vidéos » au sein de « Drone et Vidéos ») : la galerie affiche alors une partie par sous-groupe à l’intérieur de chaque catégorie. Une carte peut aussi être de type « Vidéo » pour afficher un clip lisible dans la galerie. Les visiteurs peuvent tout afficher ou filtrer par catégorie. Les anciennes photos sont automatiquement classées d’après leur catégorie existante.

La navigation publique utilise le menu burger plein écran sur ordinateur et mobile. Le lien « Aller au contenu » est disponible au clavier. Les animations et la vidéo d’accueil respectent le réglage de réduction des mouvements du navigateur. Les liens sociaux ne sont affichés que lorsqu’une adresse de profil est renseignée.

L’accueil de l’espace administrateur présente les indicateurs de la galerie, des raccourcis vers le suivi quotidien (demandes, CRM, planning), la gestion du site et les outils commerciaux/comptables.

La page d’accueil affiche une section « Vos retours » (avis clients) dont le contenu est éditable depuis la section « Accueil » du tableau de bord. Les cartes d’univers ouvrent directement la catégorie correspondante de la galerie; le filtre actif est conservé dans l’adresse et peut être partagé. Dans « Éditeur visuel », le canevas permet aussi de placer librement les titres, textes, boutons et images sur l’accueil, les pages Expertises, Tarifs et À propos. Les blocs se déplacent à la souris, leurs dimensions/positions se règlent précisément, leur ordre de calque se modifie, et l’ajout d’un bloc Image ouvre directement le sélecteur de photo. L’aperçu ordinateur/mobile reste un brouillon jusqu’à l’enregistrement. La galerie et le formulaire de réservation conservent leurs modules spécialisés.

Depuis l’éditeur de devis, les modifications peuvent être prévisualisées en PDF avant enregistrement. Le document comporte le logo et les coordonnées du site, l’identité du client, le numéro du devis, les dates d’émission et de validité, les prestations, le total et un espace d’accord/signature. Le fichier téléchargé porte le nom du client, la date et le numéro de devis. Les anciennes lignes de devis sont converties si leur structure est reconnue; les lignes invalides sont signalées au lieu de produire des champs « undefined » ou des montants « NaN ». Le module de comptabilité propose aussi un rapport PDF annuel ainsi que l’export Excel (.xlsx) mis en forme : une seule feuille « Tableau de bord » imprimable sur une page A4 : indicateurs, évolution mensuelle, graphiques et journal des écritures (HT/TVA/TTC, totaux par formule). Le rapport rappelle que la TVA affichée est estimative.

Les demandes du formulaire Contact sont conservées dans la boîte de réception administrateur, où leur suivi peut être modifié et où elles peuvent être supprimées. Passer une demande en « Confirmée » envoie automatiquement un e-mail de confirmation au client (si le service e-mail est configuré) ; cet e-mail peut aussi être renvoyé à la main. La boîte de réception est paginée et permet de répondre par e-mail. L’e-mail reste une notification : si son envoi échoue, la demande est conservée et l’état de notification est affiché dans le tableau de bord.

La rubrique « CRM clients » regroupe les demandes, devis et rendez-vous dans des fiches clients. L’adresse e-mail sert d’identifiant principal et le téléphone de secours; deux e-mails différents ne sont pas fusionnés simplement parce qu’ils partagent un numéro. Vous pouvez modifier les coordonnées, suivre l’étape commerciale, ajouter des notes privées, créer des relances datées et les marquer comme terminées. Ces fiches et relances sont enregistrées dans la base SQLite; les données des demandes, devis et rendez-vous restent dans leurs modules habituels.

Un rappel automatique (« votre rendez-vous est demain ») est envoyé la veille de chaque rendez-vous confirmé. L’envoi est idempotent (suivi par demande) et se déclenche au démarrage du serveur puis une fois par jour ; il peut aussi être lancé à la main. L’e-mail de devis continue d’être envoyé directement à Tom à chaque nouvelle demande.

Dans « Planning », faites glisser un rendez-vous sur un autre jour du calendrier pour modifier sa date; utilisez « Modifier » pour changer l’heure ou les autres informations. La galerie et le planning proposent également des commandes sans glisser-déposer. Le calendrier permet de gérer les horaires indicatifs et les dates indisponibles depuis la section Contact du dashboard. Le formulaire public masque les horaires qui chevauchent un rendez-vous non annulé et indique explicitement si la disponibilité du serveur ne peut pas être vérifiée. Une demande reste à confirmer directement avec le client : ce calendrier ne réserve pas automatiquement le créneau et le système ne gère pas de paiement en ligne.

Les mots de passe, les secrets de session et les paramètres SMTP restent dans la configuration serveur et ne sont jamais exposés comme champs éditables du site.

Les envois d’e-mail restent désactivés tant que les paramètres SMTP ne sont pas renseignés : le formulaire affiche alors une erreur explicite au lieu d’indiquer qu’une demande a été envoyée. La configuration SMTP dépend du fournisseur de messagerie utilisé.

## Production

Configurer `NODE_ENV=production`, `APP_ORIGIN`, `SESSION_SECRET` (au moins 32 caractères), le compte administrateur et les paramètres SMTP. Exécuter `npm run build`, puis `npm start` derrière un proxy HTTPS. Le serveur Express distribue alors l’application compilée, l’API et les photos envoyées.

Le contenu, les sessions, les écritures comptables, les fiches CRM et les relances sont conservés dans `server/data/tom-photo.sqlite`. Les médias publics sont conservés dans `server/uploads` et les justificatifs comptables privés dans `server/private-accounting-receipts`. Ces emplacements doivent disposer d’un stockage persistant et être sauvegardés lors d’un déploiement. Ils sont configurables avec `DATA_DIR`, `UPLOAD_DIR` et `RECEIPTS_DIR` ; en production le serveur écoute sur `0.0.0.0` (ou `HOST`).

### Déploiement sur Render

Le fichier `render.yaml` décrit le service : poussez le dépôt sur GitHub, puis dans Render choisissez « New → Blueprint » et sélectionnez le dépôt. Renseignez les variables marquées « à saisir » : `APP_ORIGIN` (l’adresse exacte du site, ex. `https://tom-photo.onrender.com`), `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (valeur générée par `npm run setup:admin` dans `.env`), `CONTACT_TO`, `SMTP_USER`, `SMTP_PASSWORD` (mot de passe d’application Gmail) et `SMTP_FROM`. `SESSION_SECRET` est généré automatiquement. Le fichier utilise l’offre gratuite : le service se met en veille après 15 minutes sans visite (le premier chargement prend alors environ une minute) et son disque est éphémère, donc la base, les photos envoyées et les justificatifs sont perdus à chaque redémarrage ou nouveau déploiement. Pour les conserver, passez à une offre payante, ajoutez un disque sur `/var/data` et définissez `DATA_DIR=/var/data/data`, `UPLOAD_DIR=/var/data/uploads` et `RECEIPTS_DIR=/var/data/private-accounting-receipts`.

Les téléversements sont limités à 100 Mo et acceptent uniquement des images JPEG, PNG, WebP, GIF ou AVIF, ainsi que des vidéos MP4 ou WebM dont le type réel est contrôlé côté serveur.

