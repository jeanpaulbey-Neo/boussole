# SPEC — App d'éducation & d'orientation à l'optimisation financière (France)

> **Document de mise en œuvre destiné à Claude Code.**
> Objectif : permettre la construction d'un MVP fonctionnel sans décision produit supplémentaire. Tout ce qui est ambigu est tranché ici. Ce qui doit être vérifié humainement est explicitement signalé.

---

## 0. TL;DR pour l'agent de build

Construire une app mobile de **micro-learning + bilan d'orientation fiscale/budgétaire**, ciblant les foyers qui ne peuvent pas se payer un conseiller. L'app **éduque et oriente**, elle ne **conseille jamais** un produit ou un montant précis (frontière juridique CIF — voir §10).

Trois briques :
1. **Profilage** (15 questions déclaratives) → produit un objet `UserProfile`.
2. **Moteur d'orientation + calcul** → à partir du profil, sélectionne des **leviers**, les chiffre, les trie par **coût net** et par gain estimé, applique le filtre « zéro dépense ».
3. **Micro-learning** (modules de 60 s) → explique chaque levier ; moteur de génération Claude adossé à une **base de connaissances curée et sourcée** (pas de génération libre sur les chiffres).

**Règle d'or de fiabilité :** aucun montant/plafond/taux fiscal n'est codé en dur. Tout vient de `fiscal-params.json`, versionné, daté, sourcé (§4). Les leçons et les calculs lisent ce fichier.

---

## 1. Stack & contraintes

Aligné sur l'écosystème existant du porteur (cohérence avec l'app Discours) :

- **Front mobile** : React Native + TypeScript. Cible **Android d'abord** (Play Store), iOS ensuite.
- **Appels LLM** : API Claude (modèle `claude-sonnet-4-...` pour la génération de leçons) via **proxy Vercel** (la clé API ne transite jamais par le client).
- **Monétisation** : RevenueCat (freemium — voir §9).
- **Stockage** : local d'abord (profil + progression sur l'appareil, ex. AsyncStorage/MMKV). Pas de compte obligatoire au MVP. Aucune donnée bancaire (le profilage est purement déclaratif).
- **Conformité Play** : respecter les contraintes déjà rencontrées sur Discours (taille de page mémoire 16 Ko → AGP 8.5.1+, NDK r28+).
- **i18n** : FR au MVP. Architecture prête pour EN/ES (clés de traduction), non prioritaire.

Contrainte forte : **offline-first pour le contenu déjà chargé** (les modules consultés doivent rester lisibles sans réseau). La génération Claude n'intervient que pour l'approfondissement à la demande, pas pour le socle.

---

## 2. Principes produit non négociables

1. **Orienteur, pas conseiller.** L'app dit « voici comment ça marche, ce que ça te rapporterait à *ta* situation, et où agir toi-même ». Jamais « souscris le produit X pour Y € ».
2. **Coût net affiché partout.** Chaque levier porte un tag 🟢 Gratuit / 🔵 Réorientation / 🟠 Dépense (§6). Le filtre « zéro dépense » est **activé par défaut**.
3. **Sourcing systématique.** Chaque chiffre affiché renvoie à une source officielle (BOFiP, service-public.fr, impots.gouv.fr, Urssaf, mesdroitssociaux.gouv.fr).
4. **Honnêteté sur l'inefficace.** Si un levier ne sert pas le profil (déduction pour non-imposable), l'app le dit.
5. **Savoir dire stop.** Situations complexes (succession, expatriation, gros patrimoine) → encart « consulte un professionnel », pas de simulation.

---

## 3. Architecture logique

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT React Native (Android)                                │
│                                                               │
│  ProfilingFlow ──► UserProfile (local)                        │
│        │                                                      │
│        ▼                                                      │
│  OrientationEngine ──┬─ lit fiscal-params.json (bundlé+OTA)   │
│        │             ├─ lit levers-catalog.json               │
│        │             └─ CalcEngine (TMI + formules/levier)    │
│        ▼                                                      │
│  Bilan (liste de LeverResult triés) ──► Checklist datée       │
│        │                                                      │
│        ▼                                                      │
│  LearningModule (Module 0..N) ── socle statique (bundlé)      │
│        └─ "Approfondir" ──► appel Claude (via proxy Vercel)   │
│                                                               │
│  PaywallManager (RevenueCat) gate les features premium        │
└───────────────────────────────────────────────────────────┬─┘
                                                              │
                          ┌───────────────────────────────────▼───────────┐
                          │  PROXY Vercel (serverless)                      │
                          │  - détient la clé Anthropic                     │
                          │  - injecte le system prompt "anti-hallucination"│
                          │  - borne le contexte aux paramètres fournis     │
                          └─────────────────────────────────────────────────┘
```

**Mise à jour des paramètres fiscaux** : `fiscal-params.json` est bundlé dans l'app **et** rechargeable à distance (OTA simple : un JSON hébergé, fetch au démarrage avec cache + fallback bundlé). Ainsi une loi de finances ne nécessite pas une republication Play Store complète pour corriger un plafond.

---

## 4. Modèle de données

### 4.1 `fiscal-params.json` — LA source de vérité chiffrée

Valeurs **réelles, vérifiées au 30 mai 2026** contre des sources officielles. Cadre : **loi de finances pour 2026 (LOI n° 2026-103 du 19 février 2026)**, barème applicable aux **revenus 2025 déclarés en 2026**.

Chaque bloc porte un `statut` :
- `CONFIRME` = voté/promulgué, en vigueur ;
- `STABLE` = règle non modifiée depuis plusieurs années, faible volatilité ;
- `PROVISOIRE` = issu d'un projet non encore voté (à n'utiliser qu'en intersaison budgétaire) ;
- `A_SURVEILLER` = en vigueur mais cible récurrente de réforme (voir §4.3 veille).

> ⚠️ Malgré la vérification, **re-contrôler chaque valeur avant publication** et à chaque cycle budgétaire (§13). Une info fausse fait perdre de l'argent à l'utilisateur.

```jsonc
{
  "version": "2026.1",
  "date_maj": "2026-05-30",
  "cadre_legal": "LOI n° 2026-103 du 19 février 2026 de finances pour 2026",
  "annee_revenus": 2025,
  "annee_declaration": 2026,

  // ─────────────────────────────────────────────────────────────
  // Barème IR par part — revenus 2025, revalorisé +0,9% (art. 4 LF2026)
  // Source : service-public.fr (F1419), impots.gouv.fr (simulateur DGFiP)
  // ─────────────────────────────────────────────────────────────
  "bareme_ir": {
    "statut": "CONFIRME",
    "source": "service-public.fr / DGFiP",
    "reference": "art. 4 LF 2026 ; art. 197 CGI",
    "tranches": [
      { "plafond": 11600,  "taux": 0.00 },
      { "plafond": 29579,  "taux": 0.11 },
      { "plafond": 84577,  "taux": 0.30 },
      { "plafond": 181917, "taux": 0.41 },
      { "plafond": null,   "taux": 0.45 }
    ],
    "abattement_10pct_min": 509,        // par déclarant
    "abattement_10pct_max": 14555       // par déclarant
  },

  // ─────────────────────────────────────────────────────────────
  // Crédit d'impôt emploi à domicile — 50%, remboursable
  // Source : service-public.fr, pour-les-personnes-agees.gouv.fr, Urssaf Cesu
  // ─────────────────────────────────────────────────────────────
  "credit_emploi_domicile": {
    "statut": "A_SURVEILLER",           // cf. §4.3 — cible récurrente de rabot
    "source": "service-public.fr / Urssaf Cesu",
    "reference": "art. 199 sexdecies CGI",
    "taux": 0.50,
    "est_credit_remboursable": true,    // versé même si non imposable
    "plafond_depense_base": 12000,
    "majoration_par_enfant": 1500,      // 750 € en résidence alternée
    "majoration_par_membre_65plus": 1500,
    "majorations_cumul_max": 3000,      // plafond porté à 15 000 € au plus
    "plafond_depense_majore_max": 15000,
    "plafond_premiere_annee": 15000,    // 18 000 € avec majorations
    "plafond_handicap_lourd": 20000
  },

  // ─────────────────────────────────────────────────────────────
  // Frais réels vs abattement 10% — Source : impots.gouv.fr
  // ─────────────────────────────────────────────────────────────
  "frais_reels": {
    "statut": "CONFIRME",
    "source": "impots.gouv.fr",
    "abattement_forfaitaire_taux": 0.10,
    "abattement_min": 509,
    "abattement_max": 14555,
    "forfait_teletravail_jour": 2.70    // option forfaitaire télétravail 2026
    // barème kilométrique : table annexe (annexe_bareme_km.json), publié chaque année
  },

  // ─────────────────────────────────────────────────────────────
  // Dons — CHANGEMENT 2026 : plafond "Coluche" 75% doublé à 2 000 €
  // (art. 28 LF 2026, dons effectués depuis le 14/10/2025)
  // Source : service-public.fr (A18836), legifiscal, notaires
  // ─────────────────────────────────────────────────────────────
  "dons": {
    "statut": "CONFIRME",
    "source": "service-public.fr / LégiFiscal",
    "reference": "art. 200 CGI ; art. 28 LF 2026",
    "taux_interet_general": 0.66,
    "plafond_interet_general_pct_revenu": 0.20,   // report possible 5 ans
    "taux_aide_personnes_difficulte": 0.75,       // dispositif "Coluche"
    "plafond_aide_difficulte_montant": 2000,      // ⬆ doublé (était 1 000 €)
    "coluche_date_effet_plafond_2000": "2025-10-14",
    "_note_remboursable": "Plusieurs sources évoquent un passage en crédit d'impôt remboursable pour non-imposables — À CONFIRMER sur le texte définitif et le BOFiP avant de l'affirmer dans l'app."
  },

  // ─────────────────────────────────────────────────────────────
  // Épargne salariale — PASS 2026 = 48 060 € (+2%)
  // Arrêté publié au JO du 22-23/12/2025
  // Source : service-public.fr (A15386), Société Générale/BNP/Amundi ES
  // ─────────────────────────────────────────────────────────────
  "epargne_salariale": {
    "statut": "CONFIRME",
    "source": "service-public.fr / BOSS / opérateurs ES",
    "pass": 48060,                                 // ⚠ 47 100 € = valeur 2025 (erreur fréquente)
    "abondement_pee_plafond_pct_pass": 0.08,       // = 3 844,80 €
    "abondement_pee_multiple_max_versement": 3.0,  // 300% du versement salarié
    "interessement_plafond_pct_pass": 0.75,        // exercice 2025 : 75% PASS 2025
    "blocage_pee_annees": 5,
    "interessement_participation_exonere_ir_si_verse_pee": true
  },

  // ─────────────────────────────────────────────────────────────
  // PER — déductible, bloqué jusqu'à la retraite
  // ─────────────────────────────────────────────────────────────
  "per": {
    "statut": "STABLE",
    "source": "service-public.fr",
    "deductible": true,
    "bloque_jusqu_retraite": true
    // plafond de déduction individualisé (≈10% des revenus pro, bornes liées au PASS) :
    // figure sur l'avis d'impôt de l'usager — NE PAS coder un plafond générique
  },

  "assurance_vie": {
    "statut": "STABLE",
    "source": "service-public.fr",
    "seuil_anciennete_annees": 8,
    "abattement_annuel_solo": 4600,
    "abattement_annuel_couple": 9200
  },

  "pea": {
    "statut": "STABLE",
    "source": "service-public.fr",
    "seuil_exoneration_ir_annees": 5,
    "ps_toujours_dus": true
  },

  "plafonnement_niches_fiscales": {
    "statut": "STABLE",
    "source": "impots.gouv.fr",
    "montant": 10000              // certains dispositifs y échappent
  }
}
```

> **Cas d'école détecté pendant la vérification** : une source secondaire affichait encore un PASS à 47 100 € (valeur 2025) alors que le PASS 2026 confirmé est **48 060 €**. C'est exactement le type d'erreur que le mécanisme de veille (§13) doit attraper : on ne fait jamais confiance à une source unique non officielle.

### 4.2 Types TypeScript (contrats)

```typescript
type CoutNet = 'GRATUIT' | 'REORIENTATION' | 'DEPENSE';
type Niveau = 'DEBUTANT' | 'SACHANT' | 'EXPERT';

interface UserProfile {
  situationFamiliale: 'CELIBATAIRE' | 'COUPLE' | 'PARENT_ISOLE';   // Q1
  nbCharges: 0 | 1 | 2 | 3;                                        // Q2 (3 = "3+")
  estImposable: 'OUI' | 'NON' | 'INCONNU';                         // Q3 (pivot)
  revenuMensuelFoyer: '<1500' | '1500-2500' | '2500-4000'
                     | '4000-6000' | '>6000';                      // Q4
  statut: 'SALARIE' | 'INDEPENDANT' | 'FONCTIONNAIRE'
        | 'RETRAITE' | 'SANS_EMPLOI';                              // Q5
  emploiDomicile: 'OUI' | 'NON' | 'POSSIBLE';                      // Q6
  dons: 'REGULIER' | 'OCCASIONNEL' | 'NON';                        // Q7
  epargneSalariale: 'OUI' | 'NON' | 'INCONNU';                     // Q8
  epargnePrecaution: 'OUI' | 'PARTIEL' | 'NON';                    // Q9 (garde-fou)
  capaciteEpargne: 'AUCUNE' | '<100' | '100-300' | '>300';         // Q10
  logement: 'LOCATAIRE' | 'PROPRIO_RP' | 'PROPRIO_BAILLEUR';       // Q11
  fraisProEleves: 'OUI' | 'NON';                                   // Q12
  creditsEnCours: 'OUI' | 'NON';                                   // Q13
  objectif: 'SECURISER' | 'PROJET' | 'RETRAITE' | 'IMPOTS';        // Q14
  situationParticuliere: 'SUCCESSION' | 'EXPATRIATION'
        | 'CREATION_ENTREPRISE' | 'GROS_PATRIMOINE' | 'AUCUNE';    // Q15
  filtreZeroDepense: boolean;   // défaut: true
}

interface Lever {
  id: string;                   // ex. "credit_domicile"
  titre: string;
  coutNet: CoutNet;
  moduleId: string;             // module de micro-learning associé
  prioriteBase: number;         // 0 = max
  eligible: (p: UserProfile) => boolean;
  calcule: (p: UserProfile, params: FiscalParams) => LeverResult;
  ouAgir: string[];             // étapes concrètes
  sources: string[];
}

interface LeverResult {
  leverId: string;
  coutNet: CoutNet;
  gainEstimeEuros: number | null;   // null si non chiffrable sans plus d'info
  texteCalcul: string;              // "À ta TMI de 30%, 1 000 € → ~300 € d'IR en moins"
  avertissement?: string;           // ex. "Argent bloqué jusqu'à la retraite"
}
```

### 4.3 `veille-fiscale.json` — paramètres sous surveillance (anticipation)

Bloc séparé, lu par l'app pour afficher un **bandeau « susceptible d'évoluer »** sur les leviers concernés, et utilisé par le process de veille (§13) comme liste de choses à surveiller. Ces éléments sont **en débat, NON votés** : ils ne modifient jamais un calcul tant qu'ils ne sont pas promulgués. L'app ne les présente jamais comme acquis.

```jsonc
{
  "date_maj": "2026-05-30",
  "surveillances": [
    {
      "parametre": "credit_emploi_domicile",
      "nature_risque": "Baisse du taux (50% → 40/30/25%) et/ou du plafond (12 000 → 10 000 €) ; possible progressivité selon revenu. 2e niche la plus coûteuse (~5–6,85 Md€) → cible récurrente.",
      "statut_actuel": "Maintenu en l'état pour 2026",
      "probabilite_evolution": "ELEVEE",
      "horizon": "PLF 2027",
      "nuance": "La ministre des Comptes publics a évoqué préserver le taux pour la garde d'enfant et les personnes âgées.",
      "source": "Assemblée nationale (amendements PLF) ; La finance pour tous ; Meilleurtaux"
    },
    {
      "parametre": "quotient_familial_majoration_enfants",
      "nature_risque": "Recul de l'âge de l'enfant (14 → 18 ans) ouvrant droit à la majoration pour familles de 2 enfants et +.",
      "statut_actuel": "Non tranché",
      "probabilite_evolution": "MOYENNE",
      "horizon": "PLF 2027",
      "source": "La finance pour tous (PLF 2026)"
    },
    {
      "parametre": "reduction_frais_scolarite",
      "nature_risque": "Suppression proposée de la réduction d'impôt pour frais de scolarité (collège/lycée/sup).",
      "statut_actuel": "Proposé, non tranché",
      "probabilite_evolution": "MOYENNE",
      "horizon": "PLF 2027",
      "source": "La finance pour tous"
    },
    {
      "parametre": "bareme_ir_indexation",
      "nature_risque": "Débat annuel gel vs indexation du barème. 2026 = indexé +0,9%. Un gel futur augmenterait l'impôt à revenu constant.",
      "statut_actuel": "Indexé pour 2026",
      "probabilite_evolution": "RECURRENTE",
      "horizon": "chaque PLF (octobre)",
      "source": "service-public.fr ; débats PLF"
    },
    {
      "parametre": "dons_coluche_remboursable",
      "nature_risque": "Passage possible en crédit d'impôt remboursable (bénéfice étendu aux non-imposables) — à confirmer sur texte définitif/BOFiP.",
      "statut_actuel": "Plafond 75% doublé à 2 000 € confirmé ; nature (réduction vs crédit) à confirmer",
      "probabilite_evolution": "A_CONFIRMER",
      "horizon": "déclaration 2026",
      "source": "Les Petites Pierres ; service-public.fr (à recouper)"
    }
  ]
}
```

> Règle d'affichage : si un levier proposé dans le bilan correspond à une `surveillance` de probabilité `ELEVEE` ou `RECURRENTE`, afficher une puce discrète : *« ⚠️ Règle susceptible d'évoluer ([horizon]). Montant à jour pour [année]. »* — jamais alarmiste, jamais spéculatif sur le chiffre futur.

---

## 5. Profilage — flux & UI

15 questions, **réponses tappables** (mobile-first, pas de saisie clavier sauf optionnel). Une question par écran, barre de progression, possibilité de revenir en arrière. Aucune donnée nominative ni bancaire.

| # | Question | Champ | Options (valeurs) |
|---|----------|-------|-------------------|
| Q1 | Situation familiale ? | `situationFamiliale` | Célibataire / En couple / Parent isolé |
| Q2 | Enfants ou personnes à charge ? | `nbCharges` | 0 / 1 / 2 / 3+ |
| Q3 | Payez-vous de l'impôt sur le revenu ? | `estImposable` | Oui / Non / Je ne sais pas |
| Q4 | Revenu net mensuel du foyer ? | `revenuMensuelFoyer` | <1500 / 1500-2500 / 2500-4000 / 4000-6000 / >6000 |
| Q5 | Statut professionnel ? | `statut` | Salarié / Indépendant / Fonctionnaire / Retraité / Sans emploi |
| Q6 | Employez-vous (ou pourriez) quelqu'un à domicile ? | `emploiDomicile` | Oui / Non / Pas encore mais possible |
| Q7 | Faites-vous des dons ? | `dons` | Régulièrement / Occasionnellement / Non |
| Q8 | Épargne salariale proposée (PEE, intéressement) ? | `epargneSalariale` | Oui / Non / Je ne sais pas |
| Q9 | Épargne de précaution (~3 mois de dépenses) ? | `epargnePrecaution` | Oui / Partiellement / Non |
| Q10 | Capacité d'épargne mensuelle ? | `capaciteEpargne` | Aucune / <100 / 100-300 / >300 |
| Q11 | Logement ? | `logement` | Locataire / Propriétaire (RP) / Propriétaire bailleur |
| Q12 | Trajets longs / frais pro élevés ? | `fraisProEleves` | Oui / Non |
| Q13 | Crédits en cours ? | `creditsEnCours` | Oui / Non |
| Q14 | Objectif prioritaire ? | `objectif` | Sécuriser / Projet 5-10 ans / Retraite / Réduire l'impôt |
| Q15 | Situation particulière en vue ? | `situationParticuliere` | Succession / Expatriation / Création entreprise / Gros patrimoine / Aucune |

**Estimation TMI à partir de Q4** (fonction `estimeTMI`), heuristique grossière à raffiner ; à terme remplaçable par une saisie optionnelle du revenu exact :

```
<1500      → 0%   (souvent non imposable)
1500-2500  → 11%
2500-4000  → 30%
4000-6000  → 30% à 41% (prendre 30% par défaut, signaler l'incertitude)
>6000      → 41%
```
> Croiser avec Q3 : si `estImposable = NON`, forcer TMI = 0 quel que soit Q4.
> Pour un chiffrage fin (v2 avec revenu exact saisi), ne pas réutiliser cette heuristique : appliquer le vrai `bareme_ir.tranches` de `fiscal-params.json` par part de quotient familial.

---

## 6. Moteur d'orientation + calcul

### 6.1 Tag coût net (affiché systématiquement)

| Tag | Sens | Exemples |
|-----|------|----------|
| 🟢 GRATUIT | Aucun euro ne sort. On réclame/réorganise ce qui revient déjà. | Frais réels, parts fiscales, aides non réclamées, taux de PAS |
| 🔵 REORIENTATION | Pas de dépense ; redirection d'un flux à soi (parfois bloqué). | Intéressement → PEE, déficit foncier (travaux déjà nécessaires), PER |
| 🟠 DEPENSE | Argent neuf sorti, remboursé en partie. Rentable seulement si dépense voulue. | Dons, défiscalisation, souscription de produits |

### 6.2 Catalogue de leviers (MVP) & règles d'éligibilité

```
credit_domicile        🟢 | eligible si Q6 ∈ {OUI, POSSIBLE}
frais_reels            🟢 | eligible si Q5 ∈ {SALARIE, FONCTIONNAIRE} ET Q12 = OUI
aides_non_reclamees    🟢 | eligible si Q4 ∈ {<1500, 1500-2500} OU Q5 = SANS_EMPLOI OU Q9 = NON
parts_fiscales         🟢 | eligible si Q2 ≥ 1 OU Q1 = PARENT_ISOLE
epargne_salariale_pee  🔵 | eligible si Q8 ∈ {OUI, INCONNU}
deficit_foncier        🔵 | eligible si Q11 = PROPRIO_BAILLEUR
per                    🔵 | eligible si Q9 = OUI ET Q10 ∈ {100-300, >300} ET TMI ≥ 30%
assurance_vie          🔵 | eligible si Q9 = OUI ET Q10 ∈ {100-300, >300}
pea                    🔵 | eligible si Q9 = OUI ET Q10 = >300 ET objectif ∈ {PROJET, RETRAITE}
dons                   🟠 | eligible si Q7 ∈ {REGULIER, OCCASIONNEL} ET estImposable = OUI
renovation_energetique 🟠 | eligible si Q11 = PROPRIO_RP
```

### 6.3 Garde-fous (appliqués avant le tri)

```
# Pivot non-imposable : masquer les déductions inutiles
SI estImposable = NON OU TMI = 0 :
    retirer { per, dons }              // déductions/réductions sans effet
    booster prioritaire { aides_non_reclamees, credit_domicile, epargne_salariale_pee }

# Pas d'investissement bloqué sans matelas
SI Q9 ≠ OUI :
    retirer { per, pea }
    afficher bannière "Avant d'investir, on sécurise : matelas de précaution d'abord."

# Drapeau pro
SI Q15 ≠ AUCUNE :
    afficher encart "Consulte un professionnel" (notaire/CGP/expert-comptable)
    ne PAS chiffrer la situation particulière
```

### 6.4 Filtre coût net & tri final

```
SI profile.filtreZeroDepense = true :
    ne garder que les leviers { GRATUIT, REORIENTATION }

TRI :
    1) coût net : GRATUIT < REORIENTATION < DEPENSE
    2) à coût net égal : gainEstimeEuros décroissant (null en dernier)
afficher 3 à 6 leviers max.
```

### 6.5 Formules de calcul (`CalcEngine`)

Toutes lisent `fiscal-params.json`. Exemples de référence à implémenter :

```
estimeTMI(profile) -> number            // cf. §5, croisé avec Q3

creditDomicile(depenseAnnuelle, params):
    plafond = params.credit_emploi_domicile.plafond_depense_base
              (+ majoration_par_enfant * nbCharges, borné à plafond_depense_max)
    base = min(depenseAnnuelle, plafond)
    return base * params.credit_emploi_domicile.taux   // remboursable si non imposable

fraisReels(salaireNetImposable, fraisEstimes, params):
    forfait = clamp(salaireNetImposable * 0.10, abattement_min, abattement_max)
    surplus = max(0, fraisEstimes - forfait)
    return surplus * estimeTMI(profile)     // économie d'IR approx.

dons(montant, typeOrganisme, params):
    taux = (typeOrganisme = "DIFFICULTE") ? 0.75 : 0.66
    // appliquer plafonds (pct revenu / montant) avant de retourner
    return montant * taux                   // = réduction, PAS un gain net (cf. Module 0)

interessementPEE(prime, tauxAbondement, params):
    abondement = prime * tauxAbondement     // borné par plafond_pct_pass
    impotEvite = prime * estimeTMI(profile) // car exonéré d'IR si versé
    return abondement + impotEvite          // "argent gratuit" + IR évité

per(versement, params):
    return versement * estimeTMI(profile)   // économie d'IR ; AVERTISSEMENT blocage retraite
```

> Tous les résultats chiffrés sont **illustratifs** et doivent être affichés avec la mention « estimation, à vérifier sur impots.gouv.fr ».

### 6.6 Rendu

- **Bilan d'orientation** : liste triée de `LeverResult`, chacun = titre + tag coût net + gain illustratif + bouton « Apprendre (60 s) » (→ module) + bouton « Où agir ».
- **Checklist d'actions** datée, avec rappels saisonniers :
  - approche de la campagne de déclaration (≈ avril–juin) → « vérifie tes crédits/réductions » ;
  - échéance 31/12 → « dernier moment pour verser sur PER/PEE au titre de l'année ».
- **Bandeau légal permanent** (cf. §10).

---

## 7. Micro-learning — moteur & contenu

### 7.1 Mécanique

- **Socle statique bundlé** : les modules 0 à 5 ci-dessous sont stockés en JSON dans l'app (offline, instantané, fiable). Le LLM **ne génère pas** ce socle.
- **Approfondissement à la demande** : bouton « Demander des précisions » → appel Claude via proxy, avec un **system prompt qui borne** la réponse aux paramètres fournis et **interdit d'inventer un chiffre** non présent dans le contexte.
- **Format** : 1 module ≈ 60 s de lecture. Structure constante : `accroche → contenu → pourQui → calcul → ouAgir → source → quiz`.
- **Mémoire de progression** : niveau par sujet, modules complétés, score quiz (local). Un seul format par session (cf. archi MOC du porteur).

### 7.2 System prompt du proxy (anti-hallucination) — gabarit

```
Tu es un assistant pédagogique sur la fiscalité française. Tu EXPLIQUES, tu ne
conseilles jamais un produit précis ni un montant à investir. Utilise UNIQUEMENT
les paramètres chiffrés fournis dans le contexte ci-dessous ; si un chiffre n'y est
pas, dis que tu ne peux pas l'affirmer et renvoie vers impots.gouv.fr. Cite la source
officielle de chaque affirmation chiffrée. Reste sous 120 mots.
CONTEXTE PARAMÈTRES: { ...extrait pertinent de fiscal-params.json... }
```

### 7.3 Schéma JSON d'un module

```jsonc
{
  "id": "credit_domicile",
  "ordre": 1,
  "niveau": "DEBUTANT",
  "coutNet": "GRATUIT",
  "titre": "Le crédit d'impôt emploi à domicile",
  "accroche": "...",
  "contenu": "...",
  "pourQui": "...",
  "calcul": "...",
  "ouAgir": ["...", "..."],
  "sources": ["service-public.fr", "Urssaf Cesu"],
  "quiz": {
    "question": "...",
    "options": ["...", "...", "..."],
    "bonneReponse": 1,
    "explication": "..."
  }
}
```

### 7.4 Contenu des modules 0 → 5 (texte prêt à intégrer)

**Module 0 — Vraie économie ou dépense déguisée ? (DEBUTANT, ouverture obligatoire)**
- Accroche : « Réduisez vos impôts ! » Méfiance : beaucoup de conseils te font *dépenser* pour récupérer une fraction. Apprends à distinguer ce qui t'enrichit de ce qui t'appauvrit poliment.
- Contenu : trois familles. 🟢 Gratuit (tu réclames/réorganises ce qui te revient). 🔵 Réorientation (tu rediriges un flux à toi, parfois bloqué). 🟠 Dépense (argent neuf, remboursé en partie ; utile seulement si la dépense était voulue).
- Piège : un don de 100 € « qui économise 66 € » te laisse 34 € plus pauvre. Générosité subventionnée ≠ optimisation.
- PourQui : tout le monde ; vital si chaque euro compte. C'est la boussole de l'app.
- Calcul : frais réels (🟢) = 0 € dépensé, ~165 € d'IR en moins → +165 €. Produit de défisc (🟠) = 1 000 € sortis pour 250 € de réduction → −750 € de trésorerie.
- OùAgir : active le filtre « Zéro dépense supplémentaire » (réglage par défaut conseillé).
- Source : principe de gestion budgétaire ; mise en garde des guides patrimoniaux (un investissement inadapté peut coûter plus que l'économie d'impôt).
- Quiz : « Un don de 100 € donnant 66 € de réduction, financièrement… » → b) te coûte 34 €.

**Module 1 — Crédit d'impôt emploi à domicile (DEBUTANT, 🟢)**
- Accroche : ménage, garde d'enfants, soutien scolaire, aide à un proche âgé ? L'État t'en rend la moitié — même sans payer d'impôt.
- Contenu : crédit de 50 % des sommes versées ; *crédit* = remboursé si non imposable ; plafond 12 000 €/an majoré selon le foyer ; avance immédiate Urssaf (tu n'avances que 50 %).
- PourQui : familles avec garde, aidants, tout employeur d'une aide déclarée — y compris non imposables.
- Calcul : 200 €/mois = 2 400 €/an → 1 200 € rendus.
- OùAgir : déclarer via Cesu (cesu.urssaf.fr), activer l'avance immédiate, reporter en case dédiée.
- Source : service-public.fr ; Urssaf Cesu.
- Quiz : « Si tu ne paies aucun IR, ce crédit… » → b) t'est remboursé quand même.

**Module 2 — Frais réels ou abattement 10 % ? (DEBUTANT, 🟢)**
- Accroche : par défaut le fisc enlève 10 % de ton salaire avant impôt ; si tes vrais frais dépassent, déduis-les à la place. Gratuit, il suffit de cocher.
- Contenu : abattement forfaitaire 10 % automatique ; alternative = frais réels (trajets/barème km, repas, formation, télétravail) ; tu prends le plus avantageux ; ça change la base imposable, pas le salaire.
- PourQui : salariés/fonctionnaires avec trajets longs ou frais notables ; inutile si proche du travail sans frais.
- Calcul : net imposable 25 000 € → forfait 2 500 € ; mais 40 km A/R quotidiens ≈ 4 000 € → 1 500 € de base en moins → ~165 € à 11 % (~450 € à 30 %).
- OùAgir : option à cocher dans la déclaration, détail des frais, conserver justificatifs.
- Source : impots.gouv.fr ; barème kilométrique annuel.
- Quiz : « Les frais réels remplacent… » → b) l'abattement automatique de 10 %.

**Module 3 — L'abondement de l'épargne salariale (DEBUTANT, 🔵)**
- Accroche : si ton employeur propose un PEE, il peut *ajouter* de l'argent quand tu y verses. Un des rares repas gratuits.
- Contenu : sur PEE, abondement employeur (dans une limite légale) ; placer l'intéressement/participation sur le PEE l'exonère d'IR (dans les limites) ; blocage 5 ans (sauf cas de déblocage) ; gain immédiat imbattable.
- PourQui : tout salarié dont l'entreprise propose PEE/intéressement/participation ; si « je ne sais pas » → demander au service paie (action #1).
- Calcul : 1 000 € d'intéressement, perçu = imposé ; placé avec abondement 50 % → 1 500 € exonérés d'IR (500 € gratuits + impôt évité).
- OùAgir : service RH/paie ; choix au moment du versement (délai court).
- Source : service-public.fr (limites en % du PASS à vérifier).
- Quiz : « Placer l'intéressement sur un PEE plutôt que le percevoir… » → b) peut l'exonérer d'impôt et déclencher un abondement.

**Module 4 — Les dons : 66 % ou 75 % rendus (DEBUTANT, 🟠)**
- Accroche : tu donnes déjà ? L'État te rembourse les deux tiers, parfois les trois quarts. Encore faut-il le déclarer.
- Contenu : 66 % pour l'intérêt général ; 75 % pour l'aide aux personnes en difficulté (dans une limite annuelle) ; réduction (s'impute sur l'impôt dû) ; garder les reçus.
- PourQui : personnes imposables qui donnent. Si non imposable → aucun effet (le dire). Rappel Module 0 : c'est une dépense partiellement remboursée, pas un gain.
- Calcul : 300 € à un organisme d'intérêt général → 198 € ; 100 € à une asso d'aide aux démunis → 75 €.
- OùAgir : reporter en case dédiée ; conserver les reçus fiscaux.
- Source : impots.gouv.fr (plafonds annuels à vérifier).
- Quiz : « Un don de 100 € à une asso d'aide aux plus démunis fait économiser… » → c) 75 €.

**Module 5 — Les aides que tu ne réclames pas (DEBUTANT, 🟢)**
- Accroche : chaque année des milliards d'aides ne sont pas versés faute de demande. Sans doute le plus gros gisement pour ton budget — et sans lien avec l'impôt.
- Contenu : budget pur (prime d'activité, APL, chèque énergie, complémentaire santé solidaire, bourses…) ; « non-recours » fréquent ; un simulateur officiel unique liste l'éligibilité ; argent immédiat.
- PourQui : surtout revenus modestes, transitions (perte d'emploi, temps partiel), jeunes actifs, familles ; à tester « au cas où » (anonyme, gratuit).
- Calcul : 100–200 €/mois = 1 200–2 400 €/an, souvent > toute optimisation fiscale pour ce profil.
- OùAgir : mesdroitssociaux.gouv.fr puis demande CAF/organisme.
- Source : mesdroitssociaux.gouv.fr ; service-public.fr.
- Quiz : « Meilleur réflexe pour vérifier toutes ses aides d'un coup… » → b) le simulateur mesdroitssociaux.gouv.fr.

> **Backlog contenu (post-MVP)** : modules 6-10 = PER (détaillé), assurance-vie, PEA, frais réels avancés (barème km), rénovation énergétique. Taguer chacun par coût net dès la rédaction.

---

## 8. Écrans (MVP)

1. **Onboarding** (1 écran de promesse : « Réduis tes impôts sans dépenser un euro de plus »).
2. **Profilage** (15 écrans tappables + progression).
3. **Bilan d'orientation** (liste triée + filtre zéro dépense en tête + bandeau légal).
4. **Détail d'un levier** (calcul illustratif + « Où agir » + lien module).
5. **Module de micro-learning** (lecture 60 s + quiz + bouton « Approfondir »).
6. **Checklist & rappels**.
7. **Bibliothèque de modules** (parcours libre, filtrable par coût net / niveau).
8. **Paywall** (RevenueCat) au passage vers les features premium (§9).
9. **Réglages** (refaire le profil, sources & mentions légales, à-propos).

---

## 9. Monétisation (RevenueCat)

Freemium. **Gratuit** = éducation + bilan basique → délivrer le « aha » avant tout paywall (premier levier chiffré gratuit ; règle : le moment de valeur arrive en première session).

| Gratuit | Premium |
|---------|---------|
| Modules 0-5 | Bibliothèque complète (6-10 + à venir) |
| Bilan : top 3 leviers, gain estimé masqué au-delà | Bilan complet, tous leviers chiffrés |
| Filtre zéro dépense | Simulations détaillées (montants ajustables) |
| — | Checklist + rappels saisonniers (déclaration, 31/12) |
| — | Vérif « pré-déclaration » (ai-je oublié un crédit ?) |

- Surveiller le point connu Play : une part notable des annulations sont des **échecs de facturation involontaires** → bien configurer les grace periods / billing retry RevenueCat.
- Tarif cible à tester : abonnement mensuel + annuel (positionnement « moins cher qu'une heure de CGP »).

---

## 10. Garde-fous juridiques (à faire valider par un juriste avant publication)

- **Ne jamais** recommander un produit nommé, un établissement, ni une allocation/montant personnalisé → resterait dans l'éducation et l'orientation générale, hors champ du conseil réglementé (CIF).
- **Bandeau permanent** sur le bilan et les modules :
  > *« Informations pédagogiques fondées sur les règles fiscales en vigueur. Ce n'est pas un conseil personnalisé. Vérifie ta situation sur impots.gouv.fr ou auprès d'un professionnel. »*
- **Drapeau pro** (Q15) : succession/expatriation/gros patrimoine → renvoi explicite vers un professionnel, sans simulation.
- **Exactitude** : tout chiffre sourcé + daté ; `fiscal-params.json` revu à chaque loi de finances.
- **Données** : profilage déclaratif, stocké local ; pas de collecte bancaire ; politique de confidentialité claire (exigence Play).
- ⚠️ *L'auteur de cette spec n'est ni juriste ni conseiller financier. La frontière éducation / conseil réglementé et les valeurs de `fiscal-params.json` doivent être validées par des professionnels avant tout lancement.*

---

## 11. Découpage en lots pour Claude Code

**Lot 1 — Fondations**
- Setup RN + TS + navigation ; conformité Android 16 Ko (AGP/NDK).
- `fiscal-params.json` (avec valeurs indicatives + flags À_VÉRIFIER) + loader (bundle + OTA fetch + cache/fallback).
- Types TS (§4.2). Stockage local (profil + progression).

**Lot 2 — Profilage**
- 15 écrans tappables, progression, retour arrière → `UserProfile`.
- `estimeTMI` + persistance.

**Lot 3 — Moteur d'orientation + calcul**
- `levers-catalog` (éligibilité §6.2), garde-fous (§6.3), filtre + tri (§6.4), `CalcEngine` (§6.5).
- Écrans Bilan + Détail levier + Checklist/rappels. Bandeau légal.

**Lot 4 — Micro-learning**
- Modules 0-5 en JSON bundlé (§7.4) ; lecteur 60 s + quiz + mémoire de progression.
- Proxy Vercel + bouton « Approfondir » (system prompt anti-hallucination §7.2).

**Lot 5 — Monétisation & finitions**
- RevenueCat (paywall §9, grace/billing retry).
- Onboarding, bibliothèque filtrable, réglages, politique de confidentialité.
- QA : vérifier qu'aucun chiffre n'est codé en dur hors `fiscal-params.json`.

**Definition of Done (transversale)**
- Aucun montant fiscal hors `fiscal-params.json`.
- Chaque levier affiché porte son tag coût net + sa/ses source(s).
- Filtre « zéro dépense » activé par défaut et fonctionnel.
- Bandeau légal présent sur bilan + modules.
- Fonctionne offline pour le socle déjà chargé.

---

## 12. Risques & points ouverts

- **Exactitude fiscale = charge récurrente** désormais **cadrée par le process de veille (§13)** : calendrier budgétaire, sources hiérarchisées, cron de détection + validation humaine. Reste le moat *et* un coût, mais maîtrisé.
- **Validation CIF** à confirmer juridiquement (cf. §10).
- **Estimation TMR par tranche de revenu** = grossière ; prévoir v2 avec saisie optionnelle du revenu exact / nombre de parts pour fiabiliser les calculs.
- **Monétisation de l'éducation financière** : la culture du gratuit domine ; le payant doit porter sur l'**actionnable** (calculs, checklist, rappels), pas l'inspirationnel.
- **Concurrence FR** (Learnit, BrainCaps en généraliste) : se différencier par la **verticale finance perso française** + la discipline pédagogique (mémoire de niveau, répétition espacée) + le sourcing, pas par « leçons de 2 min ».

---

## 13. Mise à jour & veille fiscale

C'est le cœur de fiabilité du produit. Deux processus distincts : la **mise à jour réglementaire** (valeurs confirmées) et la **veille anticipative** (changements dans les tuyaux). Aucun des deux ne publie automatiquement : il y a **toujours une validation humaine** avant qu'une valeur n'atteigne les utilisateurs.

### 13.1 Le calendrier budgétaire français (rythme imposé)

La fiscalité suit un cycle annuel prévisible. Le système de veille doit être réveillé à ces jalons :

| Période | Événement | Action sur les paramètres |
|---------|-----------|---------------------------|
| **Septembre–octobre** | Dépôt du Projet de loi de finances (PLF) | Ouvrir la veille anticipative ; passer les paramètres menacés en `A_SURVEILLER` ; alimenter `veille-fiscale.json` |
| **Octobre–décembre** | Débats, amendements (Assemblée, Sénat) | Suivre les amendements sur les paramètres surveillés ; ne rien changer aux calculs |
| **Fin décembre** | Arrêté PASS publié au JO | Mettre à jour `epargne_salariale.pass` (statut `CONFIRME`) |
| **Déc.–février** | Promulgation de la loi de finances | Geler les valeurs `CONFIRME` de l'année ; bump `version` (ex. 2027.0) |
| **Avril–juin** | Campagne de déclaration | Pic d'usage → s'assurer que tout est à jour ; activer les rappels in-app |

> En 2026 : PLF déposé le 14/10/2025, PASS au JO du 22-23/12/2025, **loi promulguée le 19/02/2026**. Le barème n'est donc *définitif* qu'en février — utile à savoir pour ne pas figer trop tôt.

### 13.2 Sources officielles à surveiller (hiérarchie de confiance)

Ne jamais se fier à une source unique non officielle (cf. l'erreur PASS 47 100 € vs 48 060 € détectée en §4.1). Ordre de priorité :

1. **Légifrance** — texte de la loi de finances (valeur juridique).
2. **BOFiP** (bofip.impots.gouv.fr) — doctrine fiscale opposable.
3. **service-public.gouv.fr** + **impots.gouv.fr** — vulgarisation officielle, dates de mise à jour fiables.
4. **Arrêté PASS** au Journal Officiel + opérateurs d'épargne salariale (Amundi, BNP, SG) pour recoupement.
5. **mesdroitssociaux.gouv.fr** / CAF — pour les aides (Module 5).
6. Pour l'anticipation : **dossiers PLF de l'Assemblée nationale et du Sénat** (amendements, rapports).

Règle de validation : une valeur ne passe `CONFIRME` que si elle est **recoupée sur ≥ 2 sources dont au moins une de niveau 1–3**.

### 13.3 Architecture du mécanisme (semi-automatique)

L'automatisation **détecte et alerte** ; l'humain **valide et publie**. Jamais d'auto-publication d'un chiffre fiscal.

```
┌─ Vercel Cron (planifié) ─────────────────────────────────────┐
│  Fréquence : mensuelle en temps normal ;                      │
│              hebdomadaire de septembre à février (saison PLF). │
│                                                               │
│  1) FETCH des pages sources surveillées (liste §13.2)         │
│  2) DIFF vs snapshot précédent (hash du contenu pertinent)    │
│  3) Si changement détecté OU page "actualités" nouvelle :     │
│     → appel Claude (proxy) : "Résume ce qui change pour les    │
│       paramètres suivants [liste], indique valeur avant/après,│
│       cite la source et la date d'effet. N'invente aucun       │
│       chiffre ; si non trouvé, dis-le."                        │
│  4) PRODUIT un "rapport de veille" (Markdown) →                │
│     notification (email/push admin) au porteur.               │
└───────────────────────────────────────────────────────────┬─┘
                                                              │
                          ┌───────────────────────────────────▼──┐
                          │  VALIDATION HUMAINE (porteur)          │
                          │  - vérifie sur source officielle       │
                          │  - édite fiscal-params.json /          │
                          │    veille-fiscale.json                 │
                          │  - bump version + date_maj             │
                          │  - commit → déploie le JSON hébergé     │
                          └────────────────────────────────────────┘
```

Points d'implémentation :
- **Snapshots** : stocker un hash (et un extrait) de chaque page surveillée pour détecter les diffs sans re-télécharger tout l'historique.
- **Le LLM ne décide pas** : il résume et pointe les sources. La valeur n'entre dans `fiscal-params.json` qu'après contrôle humain sur la source de niveau 1–3.
- **Réseau** : le cron tourne côté serveur (Vercel), pas dans l'app. Domaines officiels à autoriser (gouv.fr, legifrance).
- **Traçabilité** : chaque version de `fiscal-params.json` est commitée (git) → historique auditable de qui a changé quoi, quand, sur quelle source.

### 13.4 Versionnement & livraison aux apps

- **Schéma** : `ANNEE.RÉVISION` → `2026.0` (loi promulguée), `2026.1` (correctif en cours d'année), `2027.0` (nouvelle loi).
- **OTA** : l'app fetch `fiscal-params.json` + `veille-fiscale.json` au démarrage (cache + fallback bundlé). Un changement de plafond ne nécessite **pas** de republication Play Store.
- **Badge de fraîcheur** : l'app affiche « Données fiscales à jour au [date_maj] ». Si `date_maj` > 14 mois OU si un PLF est en cours (drapeau dans `veille-fiscale.json`), afficher un encart « Le budget [année] est en discussion — certaines règles peuvent changer ».
- **Compat** : le loader doit tolérer l'ajout de champs (ne jamais planter sur une clé inconnue) et logguer une alerte si une clé attendue manque.

### 13.5 Garde-fous de la veille

- Tant qu'une mesure n'est pas promulguée, elle reste dans `veille-fiscale.json` (informatif) et **ne touche aucun calcul**.
- Ne jamais afficher un chiffre futur spéculatif comme s'il était voté. La formulation autorisée est « susceptible d'évoluer », pas « passera à X € ».
- Si une source officielle et une source secondaire divergent, **l'officielle gagne** et on consigne la divergence.
- Revue humaine **obligatoire** à chaque jalon du calendrier (§13.1), même si le cron n'a rien remonté (une absence d'alerte n'est pas une preuve d'absence de changement).

### 13.6 Ajout au découpage (lot dédié)

**Lot 6 — Veille & mise à jour** (post-MVP immédiat, mais à cadrer dès le départ)
- Hébergement des deux JSON + loader OTA (cache/fallback/badge de fraîcheur) — *peut être amorcé dès le Lot 1*.
- Cron Vercel de détection de diffs + génération du rapport de veille via Claude (proxy).
- Notification admin + procédure de validation documentée (runbook : qui valide, où, comment publier).
- Affichage in-app des bandeaux « susceptible d'évoluer » et « budget en discussion ».
```
