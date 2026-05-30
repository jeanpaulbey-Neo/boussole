# Runbook : Validation & publication des paramètres fiscaux

**Propriétaire :** porteur du produit (toi) | **Fréquence :** revue mensuelle + hebdomadaire en saison budgétaire (sept.→fév.) + à chaque jalon du calendrier (§ Déclencheurs)
**Dernière mise à jour du runbook :** 2026-05-30 | **Dernière exécution :** —

Document opérationnel compagnon de `SPEC_app_optimisation_financiere.md` (voir §4.1, §4.3 et §13). Il décrit **exactement** comment passer d'une alerte de veille à une valeur publiée dans `fiscal-params.json`, sans erreur.

---

## Purpose

Garantir qu'aucune valeur fiscale fausse n'atteigne les utilisateurs. Ce runbook transforme une détection de changement (cron ou jalon calendaire) en une publication vérifiée, sourcée, datée et réversible. **Règle cardinale : l'automatisation détecte, l'humain valide et publie. Jamais d'auto-publication d'un chiffre.**

À utiliser dans trois cas :
1. Le cron de veille a remonté un rapport (changement détecté).
2. On atteint un jalon du calendrier budgétaire (même sans alerte).
3. Un utilisateur ou un contact signale une valeur qui paraît fausse.

---

## Prerequisites

- [ ] Accès en écriture au dépôt git qui héberge `fiscal-params.json` et `veille-fiscale.json`.
- [ ] Accès au déploiement qui sert ces JSON en OTA (projet Vercel).
- [ ] Le rapport de veille le plus récent (sortie du cron), si applicable.
- [ ] Marque-pages vers les sources officielles (liste ci-dessous).
- [ ] Contact d'un professionnel (expert-comptable / CGP / juriste fiscal) pour les cas ambigus — voir Escalation.

**Sources officielles (hiérarchie de confiance — ne jamais conclure sur une source unique non officielle) :**

| Niveau | Source | Usage |
|--------|--------|-------|
| 1 | Légifrance — texte de la loi de finances | Valeur juridique de référence |
| 2 | BOFiP — bofip.impots.gouv.fr | Doctrine fiscale opposable |
| 3 | service-public.gouv.fr / impots.gouv.fr | Vulgarisation officielle, dates fiables |
| 4 | Arrêté PASS au JO + opérateurs ES (Amundi, BNP, SG, HSBC) | PASS et plafonds d'épargne salariale (recoupement) |
| 5 | mesdroitssociaux.gouv.fr / CAF | Aides (Module 5) |
| 6 | Dossiers PLF Assemblée nationale & Sénat | **Veille anticipative uniquement** (non voté) |

Pages utiles à garder sous la main : barème IR (service-public.gouv.fr, fiche F1419), actualité PASS (service-public, rubrique cotisations), simulateur IR (impots.gouv.fr), dossier législatif PLF en cours (assemblee-nationale.fr / senat.fr).

---

## Déclencheurs (calendrier budgétaire)

| Période | Événement | Ce qu'on exécute |
|---------|-----------|------------------|
| Sept.–oct. | Dépôt du PLF | Procédure **VEILLE** (mettre à jour `veille-fiscale.json`, passer les paramètres menacés en `A_SURVEILLER`) |
| Oct.–déc. | Amendements (Assemblée, Sénat) | **VEILLE** hebdo ; aucun calcul modifié |
| Fin décembre | Arrêté PASS au JO | Procédure **MAJ** sur `epargne_salariale.pass` |
| Déc.–février | Promulgation loi de finances | Procédure **MAJ** complète + bump année (ex. 2027.0) |
| Avril–juin | Campagne de déclaration | Revue de contrôle (tout est-il à jour ?) + activer rappels in-app |

> Repère 2026 : PLF déposé le 14/10/2025, PASS au JO les 22-23/12/2025, loi promulguée le **19/02/2026**. Le barème n'est définitif qu'en février : ne pas figer les valeurs `CONFIRME` avant la promulgation.

---

## Procédure A — MAJ (publier une valeur confirmée)

### Étape A1 : Réunir les éléments
```
- Ouvrir le rapport de veille (si présent).
- Lister les paramètres potentiellement impactés (ex. bareme_ir, pass, dons...).
```
**Résultat attendu :** une liste claire de clés `fiscal-params.json` à vérifier.
**Si échec (pas de rapport) :** procéder quand même par le calendrier — vérifier au minimum barème IR, PASS, crédit emploi domicile, dons.

### Étape A2 : Vérifier sur source officielle (recoupement ≥ 2 sources)
```
Pour CHAQUE valeur :
  1. Ouvrir la source de niveau 1–3 correspondante.
  2. Relever : la valeur, la date d'effet, la référence légale (article CGI / loi).
  3. Recouper sur une 2e source (idéalement niveau 1–3 ; niveau 4 admis pour le PASS).
```
**Résultat attendu :** valeur identique sur ≥ 2 sources, dont une de niveau 1–3.
**Si échec (divergence) :** la source officielle l'emporte ; consigner la divergence dans le commit ; si toujours ambigu → Escalation.

### Étape A3 : Éditer `fiscal-params.json`
```
- Mettre à jour la/les valeur(s).
- Renseigner pour chaque bloc touché : "source", "reference", "statut".
- Mettre à jour "date_maj" (date du jour) et "cadre_legal" si nouvelle loi.
- Bumper "version" : correctif en cours d'année => ANNEE.+1 (ex. 2026.2) ;
  nouvelle loi de finances => ANNEE+1.0 (ex. 2027.0).
```
**Résultat attendu :** JSON valide, daté, sourcé.
**Si échec (doute sur une règle de majoration / cas particulier) :** ne pas inventer — laisser la valeur précédente, ajouter une note `_a_verifier`, et escalader.

### Étape A4 : Valider techniquement
```
- Vérifier que le JSON parse (lint).
- Lancer le test "aucune valeur fiscale hors fiscal-params.json" (DoD §11 de la SPEC).
- Vérifier que le loader tolère les nouveaux champs (pas de crash sur clé inconnue).
```
**Résultat attendu :** parse OK, tests verts.
**Si échec :** corriger avant publication ; ne jamais déployer un JSON qui ne parse pas (l'app tomberait sur le fallback bundlé — acceptable en secours mais pas le but).

### Étape A5 : Publier
```
- git commit avec message explicite :
  "fiscal-params 2026.2 : PASS 48060€ (arrêté JO 22/12/2025), recoupé SG+service-public"
- git push → déploiement du JSON hébergé.
```
**Résultat attendu :** nouveau JSON servi en OTA ; historique git traçable.
**Si échec (déploiement) :** voir Rollback.

---

## Procédure B — VEILLE (enregistrer un changement anticipé, NON voté)

### Étape B1 : Identifier la mesure
```
- Repérer dans le dossier PLF / amendements la mesure touchant un paramètre suivi.
- Noter : nature du changement, valeur avant/après envisagée, horizon, source (niveau 6).
```
**Résultat attendu :** description factuelle, datée, sourcée.
**Si échec (info floue / rumeur presse) :** ne pas l'inscrire tant qu'elle n'est pas dans un texte officiel (PLF, amendement déposé).

### Étape B2 : Mettre à jour `veille-fiscale.json`
```
- Ajouter/MAJ une entrée "surveillances" : parametre, nature_risque, statut_actuel,
  probabilite_evolution, horizon, source.
- NE PAS toucher fiscal-params.json (aucun calcul ne change).
- Passer le bloc concerné de fiscal-params.json en "statut": "A_SURVEILLER" si pertinent.
```
**Résultat attendu :** l'app affichera le bandeau « susceptible d'évoluer » sur le levier concerné.
**Si échec :** —

### Étape B3 : Publier (idem A4–A5)
Commit + push. Message type : `veille : credit_domicile sous surveillance (amendt PLF 2027, baisse taux envisagée)`.

---

## Verification

- [ ] L'app, relancée, fetch le nouveau JSON et affiche « Données fiscales à jour au [date_maj] » correcte.
- [ ] Un calcul témoin donne le bon résultat (ex. crédit emploi domicile : 2 400 € de dépense → 1 200 €).
- [ ] Le barème IR témoin est juste (ex. célibataire 1 part, 30 000 € → impôt ≈ 2 104 € ; sinon, seuils erronés).
- [ ] Les bandeaux « susceptible d'évoluer » s'affichent sur les leviers listés dans `veille-fiscale.json`.
- [ ] L'historique git montre le commit avec source citée.

---

## Troubleshooting

| Symptôme | Cause probable | Correctif |
|----------|----------------|-----------|
| Deux sources donnent des montants différents | L'une affiche encore la valeur de l'an dernier (ex. PASS 47 100 € vs 48 060 €) | Retenir la source officielle la plus récente (JO/Légifrance) ; vérifier l'année d'application |
| Le simulateur officiel ne « colle » pas au calcul de l'app | Heuristique TMI par tranche de revenu trop grossière | Normal au MVP ; afficher « estimation » ; viser la v2 avec revenu exact + vrai barème par part |
| Un plafond a une règle de majoration complexe | Cas particulier (résidence alternée, handicap, 1re année) | Reporter la règle fine dans le JSON ; en cas de doute, escalader plutôt qu'approximer |
| « Réduction » ou « crédit » d'impôt ? (ex. dons Coluche) | Texte récent ambigu entre sources | Trancher sur BOFiP / Légifrance ; tant que non confirmé, garder la mention `_a_verifier` et ne pas étendre l'éligibilité aux non-imposables |
| L'app reste sur l'ancienne valeur | Cache OTA non rafraîchi | Vérifier le déploiement du JSON, l'URL, l'en-tête de cache ; forcer un re-fetch au démarrage |

---

## Rollback

```
- Revenir au commit précédent de fiscal-params.json :
  git revert <hash>  (ou restaurer la version N-1)
- git push → l'OTA resservira la version saine.
- En dernier recours, l'app dispose du JSON bundlé (fallback) : une panne du JSON
  hébergé ne casse pas l'app, elle revient aux valeurs embarquées à la dernière build.
```
Toujours préférer un rollback rapide à une correction précipitée : une valeur **ancienne mais vérifiée** est moins dangereuse qu'une valeur **récente non vérifiée**.

---

## Escalation

| Situation | Vers qui | Comment |
|-----------|----------|---------|
| Ambiguïté réglementaire (réduction vs crédit, cas de majoration, éligibilité) | Expert-comptable / CGP / juriste fiscal | Email avec la source et la question précise ; ne pas publier tant que non tranché |
| Doute sur la frontière éducation / conseil réglementé (CIF) | Juriste | Avant toute évolution de fonctionnalité (cf. SPEC §10) |
| Aide sociale : règle d'éligibilité incertaine (Module 5) | CAF / mesdroitssociaux.gouv.fr | Renvoyer l'utilisateur au simulateur officiel plutôt que d'affirmer |

Principe : en cas de doute non levé, l'app **n'affirme pas**. Elle explique le principe et renvoie vers la source officielle ou un professionnel.

---

## History

| Date | Exécuté par | Notes |
|------|-------------|-------|
| 2026-05-30 | — | Création du runbook ; valeurs 2026 initialisées (barème IR LF2026, PASS 48 060 €, dons Coluche 2 000 €, crédit domicile 50 %). À rejouer à la promulgation de la LF 2027. |
