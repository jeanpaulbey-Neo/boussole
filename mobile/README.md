# Boussole — App mobile (React Native)

Scaffold React Native + TypeScript conforme à la SPEC §1 (Android d'abord). Il **réutilise
la même logique et les mêmes données** que la PWA via `../shared` (source de vérité unique).

## Statut

Scaffold fonctionnel **non compilé dans cet environnement** (pas de toolchain Android/iOS
ici). À initialiser dans un environnement RN standard.

## Architecture

```
mobile/
  App.tsx                navigation (état simple ; migrer vers @react-navigation en prod)
  src/
    questions.ts         15 questions de profilage (SPEC §5)
    data.ts              loader OTA + fallback bundlé (SPEC §3/§13.4)
    storage.ts           AsyncStorage : profil + progression (local-first, SPEC §1)
    theme.ts             couleurs + tags coût net
  metro.config.js        watchFolders → ../shared (moteur & données partagés)
  ../shared/engine/      moteur d'orientation + calcul (TS) — IDENTIQUE à la PWA
  ../shared/data/        fiscal-params.json, veille-fiscale.json, modules.json
```

## Démarrer (hors de cet environnement)

```bash
cd mobile
npm install
# Générer le projet natif si absent (android/ ios/) :
#   npx @react-native-community/cli init Boussole --version 0.76.5
#   puis recopier App.tsx, src/, index.js, app.json, metro/babel/tsconfig
npm run android      # ou: npm run ios
npm run tsc          # vérification de types
```

## Conformité Play (SPEC §1)

- Pages mémoire 16 Ko → **AGP 8.5.1+**, **NDK r28+**.
- Stockage local uniquement (AsyncStorage / MMKV) — pas de donnée bancaire, pas de compte.
- Offline-first du socle : les données sont **bundlées** (import JSON) puis rafraîchies en OTA.

## Monétisation

`react-native-purchases` (RevenueCat) — paywall §9, prévoir grace period / billing retry.

## Anti-hallucination

L'« Approfondir » d'un module appelle le **proxy Vercel** (`/api/approfondir`) — la clé API
ne transite jamais par le client (SPEC §7.2).

## Import de l'avis d'impôt (v2)

Le parser est partagé : `@shared/engine/avis.ts` (`parseAvisText`, `profilDepuisAvis`).
Seule l'**extraction de texte** diffère du web (où l'on utilise pdf.js / tesseract.js) :

- **PDF** : `react-native-pdf` ou un lecteur natif → texte → `parseAvisText`.
- **Photo** : OCR natif (ML Kit via `@react-native-ml-kit/text-recognition`, ou `tesseract`).

Le reste est identique : extraction **100 % sur l'appareil**, aucun upload, écran de
validation obligatoire, on ne persiste que les chiffres (jamais le document). Le profil
reçoit `sourceAvis/tmiExacte/plafondPERExact` via `profilDepuisAvis`, et le moteur partagé
les exploite automatiquement.
