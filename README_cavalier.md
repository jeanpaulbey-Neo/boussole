# Cavalier — Déploiement & installation

> ⚠️ Ce dépôt héberge désormais **deux** projets. Ce fichier documente l'app
> **Cavalier** (programme d'entraînement au sol, PWA mono-fichier `index.html`),
> conservée et servie sur la route `/cavalier`. Le projet principal du dépôt est
> maintenant **Boussole** (optimisation financière) — voir [`README.md`](./README.md).

## 1. Déployer sur Vercel (30 secondes)

### Option A — Drag & drop (le plus simple)

1. Va sur [vercel.com](https://vercel.com) (compte gratuit, login GitHub ou email)
2. Sur le dashboard, clique **« Add New… » → « Project »**
3. Tout en bas de la page, section **« Deploy without Git »** → clique sur **« Browse »** ou glisse-dépose le dossier
4. Vercel détecte automatiquement la config, déploie en ~10 secondes
5. Tu obtiens une URL du type `https://cavalier-xxxxx.vercel.app`

L'app Cavalier est accessible sur `/cavalier` (le `vercel.json` du dépôt sert Boussole à la racine `/`).

### Option B — Vercel CLI

```bash
npm i -g vercel
cd /chemin/vers/le/dossier
vercel --prod
```

## 2. Installer l'app (PWA)

### Sur Android (Chrome, Edge)
1. Ouvre l'URL `/cavalier`
2. Menu (⋮) → **« Ajouter à l'écran d'accueil »** / **« Installer l'application »**

### Sur iPhone (Safari uniquement)
1. Ouvre l'URL dans Safari
2. Bouton **Partager** → **« Sur l'écran d'accueil »**

### Sur ordinateur — Chrome ou Edge
1. Ouvre l'URL
2. Icône **⊕** (« installer ») à droite de la barre d'adresse, **ou** menu ⋮ → **« Installer… »**

## 3. Données stockées

- Coches d'exercices, semaine sélectionnée et état des dépliants → `localStorage`
- Pas de serveur, pas de compte, pas de tracking
- Les données sont locales à chaque appareil

## 4. Fichiers Cavalier

```
index.html       → l'app Cavalier complète (HTML + CSS + JS en un seul fichier)
vercel.json      → config Vercel (sert Boussole à /, Cavalier à /cavalier)
```
