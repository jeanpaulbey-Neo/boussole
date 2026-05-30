# Cavalier — Déploiement & installation

## 1. Déployer sur Vercel (30 secondes)

### Option A — Drag & drop (le plus simple)

1. Va sur [vercel.com](https://vercel.com) (compte gratuit, login GitHub ou email)
2. Sur le dashboard, clique **« Add New… » → « Project »**
3. Tout en bas de la page, section **« Deploy without Git »** → clique sur **« Browse »** ou glisse-dépose le dossier contenant `cavalier.html` + `vercel.json`
4. Vercel détecte automatiquement la config, déploie en ~10 secondes
5. Tu obtiens une URL du type `https://cavalier-xxxxx.vercel.app`

### Option B — Vercel CLI (si tu préfères le terminal)

```bash
npm i -g vercel
cd /chemin/vers/le/dossier
vercel --prod
```

À la première exécution, login interactif puis confirme les options par défaut.

### Renommer le domaine (optionnel)

Sur le dashboard Vercel → ton projet → **Settings → Domains** → tu peux ajouter un sous-domaine plus propre comme `cavalier-jp.vercel.app` (si dispo).

---

## 2. Installer l'app

### Sur Android (Opera, Chrome, Edge)

1. Ouvre l'URL Vercel dans le navigateur
2. Menu (☰ ou ⋮) → **« Ajouter à l'écran d'accueil »** ou **« Installer l'application »**
3. L'icône fer-à-cheval apparaît, lance comme une vraie app (plein écran, sans barre navigateur)

### Sur iPhone (Safari uniquement)

1. Ouvre l'URL dans Safari (pas Chrome — Chrome iOS ne sait pas installer)
2. Bouton **Partager** (carré + flèche vers le haut)
3. **« Sur l'écran d'accueil »**

### Sur ordinateur — Chrome ou Edge

1. Ouvre l'URL
2. Icône **⊕** (petit symbole « installer ») à droite de la barre d'adresse, **ou** menu ⋮ → **« Installer Cavalier… »**
3. L'app s'ouvre dans sa propre fenêtre, accessible depuis le menu Démarrer / Launchpad

### Sur ordinateur — Opera

Opera desktop **ne supporte pas l'installation PWA native** (limitation connue d'Opera, qui n'a pas réimplémenté la fonctionnalité Chromium).

Trois alternatives :
- **Installer via Chrome** une fois (Chrome et Opera coexistent sans conflit) — l'app sera lançable depuis le menu Démarrer / Launchpad indépendamment d'Opera
- **Épingler l'onglet** : clic droit sur l'onglet → « Épingler l'onglet »
- **Créer un raccourci** : menu Opera → Page → « Créer un raccourci » (mais ouvre dans un onglet classique, pas en mode app)

---

## 3. Mettre à jour l'app

Quand tu modifies `cavalier.html` :

- **Option A (drag & drop)** : refais un drag & drop sur Vercel, ça remplace la version
- **Option B (CLI)** : `vercel --prod` à nouveau

Les utilisateurs déjà installés verront la mise à jour au prochain lancement (cache `must-revalidate`).

---

## 4. Données stockées

- Les coches d'exercices, la semaine sélectionnée et l'état des dépliants sont stockés dans `localStorage` du navigateur
- Pas de serveur, pas de compte, pas de tracking
- Les données sont locales à chaque appareil (pas de sync entre téléphone et ordi)
- Vider le cache du navigateur efface la progression

---

## 5. Fichiers

```
cavalier.html    → l'app complète (HTML + CSS + JS en un seul fichier)
vercel.json      → config Vercel : sert l'app à la racine /
README.md        → ce fichier
```

Tu peux héberger ailleurs (Netlify, GitHub Pages, Cloudflare Pages) avec le même fichier `cavalier.html`. Le `vercel.json` est spécifique à Vercel mais optionnel — sans lui, l'app serait simplement servie à `/cavalier.html` au lieu de la racine.
