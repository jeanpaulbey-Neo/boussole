# Publier Boussole sur le Play Store (TWA)

Boussole est une PWA. Pour la publier sur le Google Play Store **sans dupliquer le code**, on
l'emballe dans une **TWA** (Trusted Web Activity) : une coquille Android qui ouvre l'URL de
production en plein écran, avec splash screen et barre de statut aux couleurs de l'app.

## Pré-requis (déjà en place)
- `manifest.webmanifest` : `display: standalone`, `theme_color`, `background_color`, icônes
  192/512 « maskable », `lang`, `start_url`, `shortcuts`. ✅
- Service worker offline-first. ✅
- HTTPS (déploiement Vercel). ✅
- `?ecran=droits|chiffrage|evenements|…` géré au démarrage → les raccourcis du manifeste
  ouvrent directement le bon écran. ✅

## Étapes

1. **Installer Bubblewrap**
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://boussole-impots.fr/manifest.webmanifest
   ```
   (renseigner l'`applicationId`, ex. `app.boussole.twa`, et l'URL de prod.)

2. **Construire l'APK/AAB**
   ```bash
   bubblewrap build
   ```
   Génère un Android App Bundle signé. **Conserver la clé de signature** (keystore).

3. **Digital Asset Links** — relier le domaine et l'app pour retirer la barre d'URL.
   - Récupérer l'empreinte SHA-256 de la clé de signature :
     ```bash
     keytool -list -v -keystore <chemin>.keystore -alias <alias>
     ```
     (ou, si on utilise « Play App Signing », prendre l'empreinte fournie par la console Play.)
   - Reporter cette empreinte et le `package_name` dans **`/.well-known/assetlinks.json`**
     (remplacer `REMPLACER_PAR_EMPREINTE_SHA256_DE_LA_CLE_DE_SIGNATURE_PLAY`), puis redéployer.
   - Vérifier : `https://boussole-impots.fr/.well-known/assetlinks.json` répond en 200.

4. **Publier** sur la Google Play Console (fiche, captures, politique de confidentialité —
   insister sur le on-device : aucun compte, données locales, seul OpenFisca est appelé sur
   action explicite).

## Notes
- Le **bouton retour matériel** est géré par l'History API (push/popstate) : il revient à
  l'écran précédent au lieu de quitter l'app.
- Mise à jour : la TWA charge l'URL de prod → toute mise à jour OTA du contenu/JS est
  immédiate, sans repasser par le Play Store (sauf changement d'icône/nom/permissions).
- iOS : pas de TWA ; rester en « Ajouter à l'écran d'accueil » (PWA) ou envisager un wrapper
  (Capacitor) plus tard si besoin de fonctions natives.
