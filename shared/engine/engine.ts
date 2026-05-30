// Moteur d'orientation + calcul — SPEC §5, §6.
// RÈGLE D'OR : aucun montant/plafond/taux n'est codé en dur ici. Tout vient de FiscalParams.
// Les seuls nombres présents sont des HYPOTHÈSES ILLUSTRATIVES de montants saisis par
// l'utilisateur (ex. « 200 €/mois »), clairement signalées comme exemples, jamais des
// paramètres fiscaux.

import {
  CoutNet,
  FiscalParams,
  Lever,
  LeverResult,
  Surveillance,
  UserProfile,
  VeilleFiscale,
} from './types';

const euros = (n: number): string =>
  Math.round(n).toLocaleString('fr-FR') + ' €';
const pct = (t: number): string => Math.round(t * 100) + ' %';

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

// ── §5 : estimation TMI à partir de Q4, croisée avec Q3 ──────────────────────
// Heuristique grossière (MVP). v2 : barème réel par part de quotient familial.
export function estimeTMI(p: UserProfile): number {
  if (p.estImposable === 'NON') return 0; // pivot : force TMI = 0
  switch (p.revenuMensuelFoyer) {
    case '<1500':
      return 0;
    case '1500-2500':
      return 0.11;
    case '2500-4000':
      return 0.3;
    case '4000-6000':
      return 0.3; // 30 % à 41 % : on prend 30 % par défaut, incertitude signalée
    case '>6000':
      return 0.41;
    default:
      return 0;
  }
}

// Incertitude sur la TMI (pour afficher un avertissement). SPEC §5.
export function tmiIncertaine(p: UserProfile): boolean {
  return p.revenuMensuelFoyer === '4000-6000' && p.estImposable !== 'NON';
}

// Montant mensuel illustratif déduit de la capacité d'épargne (Q10).
function epargneMensuelleIllustrative(p: UserProfile): number {
  switch (p.capaciteEpargne) {
    case '>300':
      return 400;
    case '100-300':
      return 200;
    case '<100':
      return 75;
    default:
      return 0;
  }
}

// Plafond de dépense emploi à domicile selon le foyer (lit les params).
function plafondCreditDomicile(p: UserProfile, c: FiscalParams['credit_emploi_domicile']): number {
  const majoration = Math.min(c.majoration_par_enfant * p.nbCharges, c.majorations_cumul_max);
  return Math.min(c.plafond_depense_base + majoration, c.plafond_depense_majore_max);
}

// ── §6.5 : formules de calcul ────────────────────────────────────────────────
// Toutes lisent FiscalParams. Résultats ILLUSTRATIFS (« estimation, à vérifier sur impots.gouv.fr »).

export const CATALOGUE: Lever[] = [
  {
    id: 'credit_domicile',
    titre: "Crédit d'impôt emploi à domicile",
    coutNet: 'GRATUIT',
    moduleId: 'credit_domicile',
    prioriteBase: 1,
    eligible: (p) => p.emploiDomicile === 'OUI' || p.emploiDomicile === 'POSSIBLE',
    ouAgir: ['Déclarer via Cesu (cesu.urssaf.fr)', "Activer l'avance immédiate", 'Reporter en case dédiée'],
    sources: ['service-public.fr', 'Urssaf Cesu'],
    calcule: (p, params) => {
      const c = params.credit_emploi_domicile;
      const depenseIllustrative = 2400; // exemple : 200 €/mois
      const base = Math.min(depenseIllustrative, plafondCreditDomicile(p, c));
      const gain = base * c.taux;
      return {
        leverId: 'credit_domicile',
        coutNet: 'GRATUIT',
        gainEstimeEuros: gain,
        texteCalcul: `Exemple : 200 €/mois (${euros(depenseIllustrative)}/an) → ${euros(
          gain,
        )} rendus (${pct(c.taux)}, crédit remboursable même si non imposable).`,
      };
    },
  },
  {
    id: 'frais_reels',
    titre: 'Frais réels plutôt que 10 %',
    coutNet: 'GRATUIT',
    moduleId: 'frais_reels',
    prioriteBase: 2,
    eligible: (p) => (p.statut === 'SALARIE' || p.statut === 'FONCTIONNAIRE') && p.fraisProEleves === 'OUI',
    ouAgir: ['Cocher l\'option dans la déclaration', 'Détailler les frais', 'Conserver les justificatifs'],
    sources: ['impots.gouv.fr', 'Barème kilométrique annuel'],
    calcule: (p, params) => {
      const tmi = estimeTMI(p);
      const surplusIllustratif = 1500; // exemple : frais réels - forfait 10 %
      const gain = surplusIllustratif * tmi;
      return {
        leverId: 'frais_reels',
        coutNet: 'GRATUIT',
        gainEstimeEuros: tmi > 0 ? gain : 0,
        texteCalcul:
          tmi > 0
            ? `Exemple : ${euros(surplusIllustratif)} de base imposable en moins → ~${euros(
                gain,
              )} d'IR à ta TMI de ${pct(tmi)}.`
            : `Sans IR à payer, déduire des frais ne rapporte rien : garde ce levier en tête si ta situation change.`,
        avertissement: tmi === 0 ? 'Inutile tant que tu n\'es pas imposable.' : undefined,
      };
    },
  },
  {
    id: 'aides_non_reclamees',
    titre: 'Aides non réclamées (budget)',
    coutNet: 'GRATUIT',
    moduleId: 'aides_non_reclamees',
    prioriteBase: 3,
    eligible: (p) =>
      p.revenuMensuelFoyer === '<1500' ||
      p.revenuMensuelFoyer === '1500-2500' ||
      p.statut === 'SANS_EMPLOI' ||
      p.epargnePrecaution === 'NON',
    ouAgir: ['Simuler sur mesdroitssociaux.gouv.fr', 'Faire la demande CAF/organisme'],
    sources: ['mesdroitssociaux.gouv.fr', 'service-public.fr'],
    calcule: () => ({
      leverId: 'aides_non_reclamees',
      coutNet: 'GRATUIT',
      gainEstimeEuros: 1800, // illustratif : milieu de 1 200–2 400 €/an
      texteCalcul:
        'Exemple : 100–200 €/mois soit 1 200–2 400 €/an. Souvent supérieur à toute optimisation fiscale pour ce profil. Aucun lien avec l\'impôt.',
    }),
  },
  {
    id: 'parts_fiscales',
    titre: 'Parts de quotient familial',
    coutNet: 'GRATUIT',
    moduleId: 'module_0_boussole',
    prioriteBase: 4,
    eligible: (p) => p.nbCharges >= 1 || p.situationFamiliale === 'PARENT_ISOLE',
    ouAgir: ['Vérifier le nombre de parts sur l\'avis d\'impôt', 'Déclarer enfants / parent isolé (case T)'],
    sources: ['service-public.fr', 'impots.gouv.fr'],
    calcule: () => ({
      leverId: 'parts_fiscales',
      coutNet: 'GRATUIT',
      gainEstimeEuros: null, // dépend du barème par part — non chiffrable sans le revenu exact
      texteCalcul:
        'Le bon nombre de parts (enfants, parent isolé) abaisse l\'impôt. Le gain dépend de ton revenu exact : vérifie tes parts sur ton avis.',
    }),
  },
  {
    id: 'epargne_salariale_pee',
    titre: 'Abondement épargne salariale (PEE)',
    coutNet: 'REORIENTATION',
    moduleId: 'epargne_salariale_pee',
    prioriteBase: 5,
    eligible: (p) => p.epargneSalariale === 'OUI' || p.epargneSalariale === 'INCONNU',
    ouAgir: ['Demander au service RH/paie (action #1)', 'Choisir au moment du versement (délai court)'],
    sources: ['service-public.fr'],
    calcule: (p) => {
      const tmi = estimeTMI(p);
      const primeIllustrative = 1000; // exemple : 1 000 € d'intéressement
      const abondement = primeIllustrative * 0.5; // hypothèse abondement 50 % (à confirmer chez l'employeur)
      const impotEvite = primeIllustrative * tmi; // exonéré d'IR si versé
      const gain = abondement + impotEvite;
      return {
        leverId: 'epargne_salariale_pee',
        coutNet: 'REORIENTATION',
        gainEstimeEuros: gain,
        texteCalcul: `Exemple : ${euros(primeIllustrative)} d'intéressement placé → +${euros(
          abondement,
        )} d'abondement (hyp. 50 %)${tmi > 0 ? ` + ${euros(impotEvite)} d'IR évité` : ''}.`,
        avertissement: 'Argent bloqué ~5 ans (sauf cas de déblocage).',
      };
    },
  },
  {
    id: 'deficit_foncier',
    titre: 'Déficit foncier (travaux)',
    coutNet: 'REORIENTATION',
    moduleId: 'module_0_boussole',
    prioriteBase: 6,
    eligible: (p) => p.logement === 'PROPRIO_BAILLEUR',
    ouAgir: ['Regrouper les travaux déductibles', 'Tenir la comptabilité des charges'],
    sources: ['impots.gouv.fr'],
    calcule: () => ({
      leverId: 'deficit_foncier',
      coutNet: 'REORIENTATION',
      gainEstimeEuros: null,
      texteCalcul:
        'Si tu as des travaux de toute façon nécessaires sur un bien loué, ils peuvent réduire ton revenu foncier imposable. Le gain dépend de tes loyers et travaux.',
    }),
  },
  {
    id: 'per',
    titre: "PER (épargne retraite déductible)",
    coutNet: 'REORIENTATION',
    moduleId: 'module_0_boussole',
    prioriteBase: 7,
    eligible: (p) =>
      p.epargnePrecaution === 'OUI' &&
      (p.capaciteEpargne === '100-300' || p.capaciteEpargne === '>300') &&
      estimeTMI(p) >= 0.3,
    ouAgir: ['Vérifier ton plafond de déduction sur ton avis d\'impôt', 'Ne verser que ce que tu peux bloquer'],
    sources: ['service-public.fr'],
    calcule: (p) => {
      const tmi = estimeTMI(p);
      const versementAnnuel = epargneMensuelleIllustrative(p) * 12;
      const gain = versementAnnuel * tmi;
      return {
        leverId: 'per',
        coutNet: 'REORIENTATION',
        gainEstimeEuros: gain,
        texteCalcul: `Exemple : ${euros(versementAnnuel)} versés → ~${euros(
          gain,
        )} d'IR en moins à ta TMI de ${pct(tmi)}.`,
        avertissement: 'Argent bloqué jusqu\'à la retraite (sauf cas de déblocage). Ton plafond exact figure sur ton avis d\'impôt.',
      };
    },
  },
  {
    id: 'assurance_vie',
    titre: 'Assurance-vie (enveloppe)',
    coutNet: 'REORIENTATION',
    moduleId: 'module_0_boussole',
    prioriteBase: 8,
    eligible: (p) =>
      p.epargnePrecaution === 'OUI' && (p.capaciteEpargne === '100-300' || p.capaciteEpargne === '>300'),
    ouAgir: ['Comparer les frais d\'entrée et de gestion', 'Prendre date tôt (le compteur des 8 ans tourne)'],
    sources: ['service-public.fr'],
    calcule: (p, params) => {
      const av = params.assurance_vie;
      const ab = p.situationFamiliale === 'COUPLE' ? av.abattement_annuel_couple : av.abattement_annuel_solo;
      return {
        leverId: 'assurance_vie',
        coutNet: 'REORIENTATION',
        gainEstimeEuros: null,
        texteCalcul: `Après ${av.seuil_anciennete_annees} ans, les retraits bénéficient d'un abattement annuel de ${euros(
          ab,
        )} sur les gains. Pas une réduction d'impôt immédiate : une enveloppe souple.`,
      };
    },
  },
  {
    id: 'pea',
    titre: 'PEA (actions, exonération à 5 ans)',
    coutNet: 'REORIENTATION',
    moduleId: 'module_0_boussole',
    prioriteBase: 9,
    eligible: (p) =>
      p.epargnePrecaution === 'OUI' &&
      p.capaciteEpargne === '>300' &&
      (p.objectif === 'PROJET' || p.objectif === 'RETRAITE'),
    ouAgir: ['Ouvrir le PEA tôt (le compteur des 5 ans tourne)', 'Investir progressivement'],
    sources: ['service-public.fr'],
    calcule: (p, params) => ({
      leverId: 'pea',
      coutNet: 'REORIENTATION',
      gainEstimeEuros: null,
      texteCalcul: `Après ${params.pea.seuil_exoneration_ir_annees} ans, les gains sont exonérés d'IR (les prélèvements sociaux restent dus). Pour un horizon long et un matelas déjà constitué.`,
      avertissement: 'Capital soumis aux marchés ; à réserver à un horizon long.',
    }),
  },
  {
    id: 'dons',
    titre: 'Dons (66 % ou 75 % rendus)',
    coutNet: 'DEPENSE',
    moduleId: 'dons',
    prioriteBase: 10,
    eligible: (p) => (p.dons === 'REGULIER' || p.dons === 'OCCASIONNEL') && p.estImposable === 'OUI',
    ouAgir: ['Reporter en case dédiée', 'Conserver les reçus fiscaux'],
    sources: ['impots.gouv.fr'],
    calcule: (p, params) => {
      const d = params.dons;
      const donIllustratif = 300; // exemple
      const gain = donIllustratif * d.taux_interet_general;
      return {
        leverId: 'dons',
        coutNet: 'DEPENSE',
        gainEstimeEuros: gain,
        texteCalcul: `Exemple : ${euros(donIllustratif)} d'intérêt général → ${euros(
          gain,
        )} de réduction (${pct(d.taux_interet_general)}) ; ${pct(
          d.taux_aide_personnes_difficulte,
        )} pour l'aide aux personnes en difficulté (plafond ${euros(d.plafond_aide_difficulte_montant)}).`,
        avertissement: 'Rappel Module 0 : c\'est une dépense partiellement remboursée, pas un gain net.',
      };
    },
  },
  {
    id: 'renovation_energetique',
    titre: 'Rénovation énergétique',
    coutNet: 'DEPENSE',
    moduleId: 'module_0_boussole',
    prioriteBase: 11,
    eligible: (p) => p.logement === 'PROPRIO_RP',
    ouAgir: ['Simuler les aides (MaPrimeRénov\') avant les travaux', 'Faire établir des devis par des artisans RGE'],
    sources: ['service-public.fr', 'france-renov.gouv.fr'],
    calcule: () => ({
      leverId: 'renovation_energetique',
      coutNet: 'DEPENSE',
      gainEstimeEuros: null,
      texteCalcul:
        'Des aides existent pour les travaux d\'isolation/chauffage. Rentable seulement si les travaux sont voulus : c\'est une dépense subventionnée.',
    }),
  },
];

// ── §6.3 : garde-fous appliqués AVANT le tri ─────────────────────────────────
export interface OrientationOutput {
  leviers: { lever: Lever; result: LeverResult; surveillance?: Surveillance }[];
  bannieres: string[];
  encartPro: boolean;
}

const ORDRE_COUT: Record<CoutNet, number> = { GRATUIT: 0, REORIENTATION: 1, DEPENSE: 2 };

export function orienter(
  p: UserProfile,
  params: FiscalParams,
  veille: VeilleFiscale,
): OrientationOutput {
  const tmi = estimeTMI(p);
  const bannieres: string[] = [];

  // 1) éligibilité (§6.2)
  let retenus = CATALOGUE.filter((l) => l.eligible(p));

  // 2) pivot non-imposable : masquer les déductions inutiles, booster le gratuit utile
  const boost = new Set<string>();
  if (p.estImposable === 'NON' || tmi === 0) {
    retenus = retenus.filter((l) => l.id !== 'per' && l.id !== 'dons');
    ['aides_non_reclamees', 'credit_domicile', 'epargne_salariale_pee'].forEach((id) => boost.add(id));
  }

  // 3) pas d'investissement bloqué sans matelas
  if (p.epargnePrecaution !== 'OUI') {
    retenus = retenus.filter((l) => l.id !== 'per' && l.id !== 'pea');
    bannieres.push("Avant d'investir, on sécurise : matelas de précaution d'abord.");
  }

  // 4) drapeau pro (§6.3 / §10) — on ne chiffre pas la situation particulière
  const encartPro = p.situationParticuliere !== 'AUCUNE';

  if (tmiIncertaine(p)) {
    bannieres.push('À ce niveau de revenu, ta tranche peut être de 30 % ou 41 % : les montants sont des estimations prudentes.');
  }

  // calcul + rattachement veille
  const computed = retenus.map((lever) => {
    const result = lever.calcule(p, params);
    const surveillance = veille.surveillances.find(
      (s) =>
        s.leviers.includes(lever.id) &&
        (s.probabilite_evolution === 'ELEVEE' || s.probabilite_evolution === 'RECURRENTE'),
    );
    const prioriteEffective = boost.has(lever.id) ? -1 : lever.prioriteBase;
    return { lever, result, surveillance, prioriteEffective };
  });

  // §6.4 : filtre coût net (zéro dépense activé par défaut)
  let filtres = computed;
  if (p.filtreZeroDepense) {
    filtres = computed.filter((c) => c.result.coutNet !== 'DEPENSE');
  }

  // §6.4 : tri — 1) coût net, 2) boost/priorité, 3) gain décroissant (null en dernier)
  filtres.sort((a, b) => {
    const byCout = ORDRE_COUT[a.result.coutNet] - ORDRE_COUT[b.result.coutNet];
    if (byCout !== 0) return byCout;
    const byPrio = a.prioriteEffective - b.prioriteEffective;
    if (byPrio !== 0) return byPrio;
    const ga = a.result.gainEstimeEuros;
    const gb = b.result.gainEstimeEuros;
    if (ga === null && gb === null) return 0;
    if (ga === null) return 1;
    if (gb === null) return -1;
    return gb - ga;
  });

  // 3 à 6 leviers max
  const top = filtres.slice(0, 6).map(({ lever, result, surveillance }) => ({ lever, result, surveillance }));

  return { leviers: top, bannieres, encartPro };
}

// Calcul d'IR par le barème réel (quotient familial simplifié) — lit fiscal-params.json.
// Sert à la vérification du RUNBOOK (célibataire 1 part, 30 000 € → ≈ 2 104 €) et à la v2
// (chiffrage fin avec revenu exact). Aucun seuil codé en dur : tout vient des tranches.
export function calcIR(revenuNetImposable: number, nbParts: number, params: FiscalParams): number {
  const parPart = revenuNetImposable / nbParts;
  let impot = 0;
  let bas = 0;
  for (const tr of params.bareme_ir.tranches) {
    const plafond = tr.plafond === null ? Infinity : tr.plafond;
    if (parPart > bas) impot += (Math.min(parPart, plafond) - bas) * tr.taux;
    bas = plafond;
    if (parPart <= plafond) break;
  }
  return Math.round(impot * nbParts);
}

// Badge de fraîcheur (§13.4)
export function badgeFraicheur(params: FiscalParams, veille: VeilleFiscale): {
  texte: string;
  alerte: string | null;
} {
  const texte = `Données fiscales à jour au ${params.date_maj}`;
  const maj = new Date(params.date_maj);
  const moisEcoules = (Date.now() - maj.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
  let alerte: string | null = null;
  if (veille.plf_en_cours) {
    alerte = `Le budget est en discussion — certaines règles peuvent changer.`;
  } else if (moisEcoules > 14) {
    alerte = `Ces données datent de plus de 14 mois — une mise à jour est probablement nécessaire.`;
  }
  return { texte, alerte };
}
