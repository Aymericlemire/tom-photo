# Guide du développeur — Tom Photo

Ce guide t'aide à modifier le site toi-même : lancer le projet, te repérer dans le code, ajouter une page ou une fonction, et publier.

---

## 1. Démarrer en 2 minutes

```powershell
cd D:\dev\tom-photo-site\tom-photo-vite-app
npm install              # une seule fois (ou après un changement de package.json)
npm run setup:admin      # une seule fois : crée ton compte admin dans .env
npm run dev              # lance le site + l'API
```

- Site : http://127.0.0.1:5175
- Admin : http://127.0.0.1:5175/admin
- L'API tourne sur le port 5174 ; le site la joint automatiquement.
- Le code se recharge tout seul quand tu enregistres un fichier.

### Depuis VS Code (sans taper de commande)

`Ctrl+Maj+P` → **Tasks: Run Task**, puis choisis :

| Tâche | Ce qu'elle fait |
|---|---|
| ▶ Lancer le site (dev) | `npm run dev` (aussi : `Ctrl+Maj+B`) |
| ✅ Lancer les tests | `npm test` |
| 📦 Vérifier avant de publier | tests + build |
| 🔌 Qui utilise les ports 5174 / 5175 ? | Aide si « Port already in use » |
| 🔐 Créer / changer le compte admin | `npm run setup:admin` |
| 🚀 Publier | vérifie puis `git push` (= mise en ligne) |

`F5` ouvre le menu de débogage : **serveur (API)**, **site dans Chrome**, ou **un fichier de test**. Les points d'arrêt fonctionnent.

---

## 2. Les commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance tout en développement |
| `npm test` | Lance tous les tests (`tests/`) |
| `npm run build` | Compile le site dans `dist/` |
| `npm run check` | Tests + build : à faire avant de publier |
| `npm run ports` | Montre qui occupe les ports 5174/5175 |
| `npm start` | Lance le serveur « comme en ligne » (après un build) |
| `npm run setup:admin` | Crée l'identifiant et le mot de passe admin |

---

## 3. Comment les pièces s'emboîtent

```
Navigateur ── React (src/) ── api('/api/...') ──▶ Express (server/index.js) ──▶ SQLite
                                                       │                       (server/data/tom-photo.sqlite)
                                                       ├─ valide avec zod        server/lib/schema.js
                                                       ├─ lit/écrit via des "stores"  server/lib/*-store.js
                                                       └─ envoie des e-mails      server/lib/email.js
```

- **Contenu du site** (textes, photos, tarifs, menu…) : un grand JSON stocké en base, éditable dans l'admin. Valeurs par défaut : `server/default-content.json`. Forme exigée : `contentSchema` dans `server/lib/schema.js`.
- **Données métier** (demandes, CRM, planning, devis, comptabilité) : une table par sujet, gérée par un « store » dans `server/lib/`.
- **Admin** : `src/pages/AdminPage.jsx` affiche des modules (`src/components/*Manager.jsx`). Les routes `/api/admin/...` exigent la connexion (`requireAdmin`).

---

## 4. Où modifier quoi

| Je veux… | Fichier |
|---|---|
| Changer les couleurs / tailles / mise en page | `src/styles/site.css` |
| Changer un texte ou une photo | **Admin** (pas de code) ; valeurs par défaut dans `server/default-content.json` |
| Modifier l'accueil / la galerie / etc. | `src/pages/HomePage.jsx`, `GalleryPage.jsx`… |
| Modifier le menu burger | `src/components/Header.jsx` (liens = `site.navigation` du contenu) |
| Changer le calcul / l'affichage des devis | `src/lib/quote-format.js`, `src/components/QuoteManager.jsx` |
| Changer le PDF des devis ou du rapport | `src/lib/pdf-export.js` |
| Changer l'export Excel | `src/lib/accounting-xlsx.js` |
| Changer le texte des e-mails | `server/lib/email.js` |
| Changer une règle de validation | `server/lib/schema.js` |

---

## 5. Recettes (pas à pas)

### A. Ajouter une page publique

1. Crée `src/pages/MaPage.jsx` :
   ```jsx
   export default function MaPage() {
     return (
       <section className="empty-state">
         <h1>Ma nouvelle page</h1>
       </section>
     );
   }
   ```
2. Dans `src/App.jsx`, importe-la et ajoute sous `<Route path="/" ...>` :
   ```jsx
   <Route path="ma-page" element={<MaPage />} />
   ```
3. Pour l'ajouter au menu : dans l'admin (ou `server/default-content.json`), ajoute `{ "label": "Ma page", "path": "/ma-page" }` dans `site.navigation`.

### B. Ajouter un module dans l'admin

1. Crée `src/components/MonModule.jsx` (modèle : `QuoteManager.jsx`, il reçoit `onError`).
2. Dans `src/pages/AdminPage.jsx` :
   - ajoute une ligne à `ADMIN_SECTIONS` : `{ key: 'monmodule', label: 'Mon module', icon: '★', description: '…' }`
   - ajoute le rendu avec les autres : `{activeSection === 'monmodule' && <MonModule onError={reportError} />}`

### C. Ajouter une route d'API

Dans `server/index.js`, sur le modèle des routes `/api/admin/quotes` :

```js
app.get('/api/admin/mon-truc', requireAdmin, (request, response) => {
  response.json({ items: monStore.list() });
});

app.post('/api/admin/mon-truc', requireAdmin, (request, response) => {
  const parsed = monTrucSchema.safeParse(request.body);   // schéma zod dans schema.js
  if (!parsed.success) {
    response.status(400).json({ error: 'Données invalides.' });
    return;
  }
  response.status(201).json(monStore.get(monStore.create(parsed.data)));
});
```

- `requireAdmin` protège la route (retire-le seulement pour une route publique, comme `/api/contact`).
- Appel côté React : `await api('/api/admin/mon-truc', { method: 'POST', body: JSON.stringify(data) })`.

### D. Ajouter une table (nouveau « store »)

1. Crée `server/lib/mon-store.js` en copiant la structure de `quote-store.js` : une fonction `initializeMonStore(database)` qui fait `CREATE TABLE IF NOT EXISTS …` et renvoie `{ create, get, list, update, delete }`.
2. Dans `server/database.js` : importe-la, appelle `initializeMonStore(db)` et exporte-la (voir `quotes`, `crm`).
3. Si tu ajoutes une colonne plus tard, utilise le principe de « migration douce » de `quote-store.js` (`ensureColumn`) pour ne pas casser les bases existantes.

### E. Ajouter un test

Crée `tests/mon-test.test.js` (le runner natif de Node les trouve tout seul) :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeMonStore } from '../server/lib/mon-store.js';

test('crée un élément', () => {
  const store = initializeMonStore(new Database(':memory:'));   // base temporaire
  const id = store.create({ nom: 'Essai' });
  assert.equal(store.get(id).nom, 'Essai');
});
```

Lance-le avec `npm test` (ou `F5` → « Déboguer un fichier de test »).

---

## 6. Règles à retenir (pièges classiques)

- **Les prix sont en CENTIMES partout** (base, API, calculs). On ne convertit en euros qu'à l'affichage et à la saisie. Utilise `src/lib/quote-format.js` (`euroToCents`, `formatEuros`, `quoteTotalCents`) : ne refais pas le calcul à la main.
- **Le serveur est la référence** : toute donnée reçue est validée par zod (`schema.js`) et le total d'un devis est recalculé côté serveur.
- **Texte dans un PDF** : n'utilise pas `toLocaleString('fr-FR')` directement (l'espace des milliers s'affiche « / »). Passe par `formatEuros` / `toPdfSafeText`.
- **Secrets** : `.env` n'est jamais publié (`.gitignore`). Ne mets pas de mot de passe dans le code.
- **Après modification de `server/*`** l'API redémarre toute seule ; après modification de `package.json`, refais `npm install`.
- **« Port 5175 is already in use »** : un ancien `npm run dev` tourne encore. Lance `npm run ports`, puis `Stop-Process -Id <PID>`.
- **Mot de passe admin oublié** : `npm run setup:admin`, puis mets le nouveau `ADMIN_PASSWORD_HASH` dans Render si le site en ligne doit suivre.

---

## 7. Publier (mise en ligne)

```powershell
git add .
git commit -m "Ce que j'ai changé"
npm run check        # tests + build
git push             # lance automatiquement le déploiement sur Render
```

1. `git push` déclenche GitHub Actions (`.github/workflows/deploy-render.yml`).
2. Render rebuild et redéploie en 1 à 2 minutes → https://tom-photo.onrender.com
3. Suivi : https://github.com/Aymericlemire/tom-photo/actions

Rappel : sur l'offre gratuite de Render, les données saisies en ligne (devis, clients, photos…) sont **effacées à chaque redéploiement**. Pour les garder : offre payante + disque (voir README, section « Production »).

---

## 8. Voir ce qu'il y a dans la base

Installe l'extension **SQLite Viewer** (recommandée par le projet), puis ouvre `server/data/tom-photo.sqlite` dans VS Code. Ne la modifie pas pendant que le serveur tourne : passe par l'admin.

---

## 9. Ressources

- `README.md` : fonctionnalités et configuration (SMTP, production).
- `ARBORESCENCE.md` (dans `D:\dev\tom-photo-site`) : carte détaillée des dossiers.
- Les commentaires en tête de `server/lib/*-store.js` expliquent chaque module.
