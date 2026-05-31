# Boussole — éducation & orientation à l'optimisation financière (France)

App d'apprentissage rapide (« micro-learning ») + **bilan d'orientation fiscale et
budgétaire**, pour les foyers qui ne peuvent pas se payer un conseiller. L'app **éduque et
oriente** — elle ne **conseille jamais** un produit ni un montant précis (frontière CIF).

> Projet autonome. Mise en œuvre des documents `docs/SPEC_app_optimisation_financiere.md`
> et `docs/RUNBOOK_validation_fiscale.md`.

## Ce qui est livré

1. **PWA web** (à la racine : `index.html`, `js/`, `css/`, `icons/`, `sw.js`) — déployable
   sur Vercel, installable Android/iOS, **offline-first**. MVP complet, vérifiable de suite.
2. **Scaffold React Native** (`mobile/`) — fidèle à la SPEC §1, réutilise le moteur partagé.
3. **Données partagées** (`shared/`) — `fiscal-params.json`, `veille-fiscale.json`,
   `modules.json` + moteur TypeScript. **Source de vérité unique** consommée par les deux.
4. **Proxy Vercel** (`api/`) — `approfondir` (leçons Claude, anti-hallucination §7.2) et
   `cron-veille` (détection de changements fiscaux §13.3).

## Règle d'or (fiabilité)

**Aucun montant / plafond / taux fiscal n'est codé en dur.** Tout vient de
`shared/data/fiscal-params.json` (versionné, daté, sourcé). Les seuls nombres dans le code
sont des **hypothèses illustratives** de montants utilisateur (ex. « 200 €/mois »),
clairement signalées comme exemples. Un test le vérifie (`npm test`).

## Arborescence

```
shared/
  data/
    fiscal-params.json        LA source de vérité chiffrée (LF 2026, statuts CONFIRME/STABLE/…)
    veille-fiscale.json       paramètres sous surveillance (bandeaux « susceptible d'évoluer »)
    modules.json              modules 0–5 du socle pédagogique (offline)
    annexe_bareme_km.json     barème kilométrique (table annexe)
  engine/
    types.ts                  contrats (UserProfile, Lever, LeverResult, FiscalParams…)
    engine.ts                 TMI, catalogue de leviers, garde-fous, tri, calcIR, badge
    avis.ts                   parser d'avis d'impôt (partagé mobile)

index.html                    PWA (buildless), servie à la racine /
manifest.webmanifest  sw.js   PWA installable + offline-first
css/styles.css
js/  data.js (loader OTA+cache+fallback)  engine.js (miroir du moteur)  app.js (UI/écrans)  avis.js (parser avis)
icons/  icon-192.png  icon-512.png  generate-icons.mjs

api/                          proxy Vercel (serverless)
  approfondir.js              appel Claude borné aux paramètres (clé API côté serveur)
  cron-veille.js              veille fiscale (fetch + hash + résumé Claude → rapport admin)
  _lib/systemPrompt.js        gabarit anti-hallucination (§7.2)

mobile/                       scaffold React Native + TS (voir mobile/README.md)
test/  engine.test.mjs  avis.test.mjs   tests du moteur et du parser d'avis
docs/                         SPEC + RUNBOOK (traçabilité)
vercel.json                  en-têtes de cache + cron de veille (index.html servi nativement)
```

## Lancer en local

```bash
# Tests (barème IR, crédit domicile, garde-fous, tri, PASS 48 060, parser d'avis…)
npm test

# Servir la PWA en statique (depuis la racine du dépôt)
npm run dev            # → http://localhost:8000/
```

> La PWA est servie à la racine `/`. Le service worker exige `localhost` ou HTTPS.

## Déployer sur Vercel

```bash
npm i -g vercel
vercel --prod
```

- `/` sert la PWA **Boussole** (la racine du dépôt est la racine du projet Vercel).
- Le proxy `/api/*` est **optionnel** (voir ci-dessous).
- Un **cron mensuel** déclenche `/api/cron-veille` (à intensifier manuellement en saison PLF).

## Clé API : optionnelle

L'app se **crée, se déploie et s'utilise sans aucune clé**. Tout le cœur (profilage,
bilan, leviers chiffrés, modules + quiz, hors-ligne) lit les données locales. La clé
`ANTHROPIC_API_KEY` n'active que deux fonctions **facultatives**, qui dégradent proprement
sans elle :

| Fonction | Sans clé |
|---|---|
| Bouton « Demander des précisions » (leçon Claude) | message « le module reste complet hors-ligne » |
| Cron de veille `/api/cron-veille` | rapport généré sans le résumé Claude |

Pour l'activer plus tard : Vercel → Settings → Environment Variables (cf. `.env.example`).

## Mise à jour des paramètres fiscaux (le moat)

Le cœur de fiabilité est **humain** : l'automatisation détecte, l'humain valide et publie.
Procédure complète dans `docs/RUNBOOK_validation_fiscale.md` :

1. Le cron `api/cron-veille.js` (ou un jalon du calendrier budgétaire) produit un rapport.
2. On vérifie chaque valeur sur source officielle (Légifrance / BOFiP / service-public).
3. On édite `shared/data/fiscal-params.json` (+ `version`, `date_maj`, `source`, `statut`).
4. Commit + push → le JSON est resservi en **OTA** (cache + fallback bundlé) sans republier
   les apps. L'historique git rend chaque changement auditable.

## Import de l'avis d'impôt (v2 — chiffrage personnalisé)

Depuis **Réglages → Importer mon avis d'impôt** (ou le lien « affiner avec mon avis » sur le
bilan), l'utilisateur peut charger son avis (**PDF** ou **photo**). L'app remplace alors ses
estimations par ses **vrais chiffres** : TMI exacte, nombre de parts, et surtout le
**plafond PER personnel** (que la SPEC §4.1 interdit justement de coder en dur).

**Confidentialité — tout est local (SPEC §1/§10).** Le document est analysé **sur l'appareil**
(pdf.js pour le PDF, OCR tesseract.js pour les photos, chargés à la demande). Seuls ~5 chiffres
sont extraits ; **rien n'est envoyé à un serveur**, le fichier n'est pas conservé. Un **écran de
validation** impose à l'utilisateur de vérifier/corriger les valeurs avant qu'elles ne touchent
un calcul — l'app ne devine jamais à sa place.

- Parser : `js/avis.js` (web) et `shared/engine/avis.ts` (mobile) — `parseAvisText` +
  `profilDepuisAvis`. Tests : `test/avis.test.mjs`.
- Le moteur (`estimeTMI`, levier `per`) utilise `tmiExacte` / `plafondPERExact` si présents.

## Garde-fous produit (SPEC §2, §10)

- **Orienteur, pas conseiller** : jamais « souscris X pour Y € ».
- **Coût net partout** : 🟢 Gratuit / 🔵 Réorientation / 🟠 Dépense. Filtre « zéro dépense »
  **activé par défaut**.
- **Sourcing systématique** + **bandeau légal permanent** sur bilan et modules.
- **Savoir dire stop** : succession / expatriation / gros patrimoine → encart « consulte un
  professionnel », pas de simulation.

> ⚠️ L'auteur de la SPEC n'est ni juriste ni conseiller financier : la frontière
> éducation / conseil réglementé (CIF) **et** les valeurs de `fiscal-params.json` doivent
> être validées par des professionnels avant tout lancement.
