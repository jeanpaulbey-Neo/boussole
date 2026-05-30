// Contrats de données — SPEC §4.2. Source de vérité partagée web + mobile.

export type CoutNet = 'GRATUIT' | 'REORIENTATION' | 'DEPENSE';
export type Niveau = 'DEBUTANT' | 'SACHANT' | 'EXPERT';

export interface UserProfile {
  situationFamiliale: 'CELIBATAIRE' | 'COUPLE' | 'PARENT_ISOLE'; // Q1
  nbCharges: 0 | 1 | 2 | 3; // Q2 (3 = "3+")
  estImposable: 'OUI' | 'NON' | 'INCONNU'; // Q3 (pivot)
  revenuMensuelFoyer: '<1500' | '1500-2500' | '2500-4000' | '4000-6000' | '>6000'; // Q4
  statut: 'SALARIE' | 'INDEPENDANT' | 'FONCTIONNAIRE' | 'RETRAITE' | 'SANS_EMPLOI'; // Q5
  emploiDomicile: 'OUI' | 'NON' | 'POSSIBLE'; // Q6
  dons: 'REGULIER' | 'OCCASIONNEL' | 'NON'; // Q7
  epargneSalariale: 'OUI' | 'NON' | 'INCONNU'; // Q8
  epargnePrecaution: 'OUI' | 'PARTIEL' | 'NON'; // Q9 (garde-fou)
  capaciteEpargne: 'AUCUNE' | '<100' | '100-300' | '>300'; // Q10
  logement: 'LOCATAIRE' | 'PROPRIO_RP' | 'PROPRIO_BAILLEUR'; // Q11
  fraisProEleves: 'OUI' | 'NON'; // Q12
  creditsEnCours: 'OUI' | 'NON'; // Q13
  objectif: 'SECURISER' | 'PROJET' | 'RETRAITE' | 'IMPOTS'; // Q14
  situationParticuliere: 'SUCCESSION' | 'EXPATRIATION' | 'CREATION_ENTREPRISE' | 'GROS_PATRIMOINE' | 'AUCUNE'; // Q15
  filtreZeroDepense: boolean; // défaut: true
}

export interface FiscalParams {
  version: string;
  date_maj: string;
  cadre_legal: string;
  annee_revenus: number;
  annee_declaration: number;
  bareme_ir: {
    statut: string;
    source: string;
    reference: string;
    tranches: { plafond: number | null; taux: number }[];
    abattement_10pct_min: number;
    abattement_10pct_max: number;
  };
  credit_emploi_domicile: {
    statut: string;
    source: string;
    reference: string;
    taux: number;
    est_credit_remboursable: boolean;
    plafond_depense_base: number;
    majoration_par_enfant: number;
    majoration_par_membre_65plus: number;
    majorations_cumul_max: number;
    plafond_depense_majore_max: number;
    plafond_premiere_annee: number;
    plafond_handicap_lourd: number;
  };
  frais_reels: {
    statut: string;
    source: string;
    abattement_forfaitaire_taux: number;
    abattement_min: number;
    abattement_max: number;
    forfait_teletravail_jour: number;
  };
  dons: {
    statut: string;
    source: string;
    reference: string;
    taux_interet_general: number;
    plafond_interet_general_pct_revenu: number;
    taux_aide_personnes_difficulte: number;
    plafond_aide_difficulte_montant: number;
  };
  epargne_salariale: {
    statut: string;
    source: string;
    pass: number;
    abondement_pee_plafond_pct_pass: number;
    abondement_pee_multiple_max_versement: number;
    interessement_plafond_pct_pass: number;
    blocage_pee_annees: number;
    interessement_participation_exonere_ir_si_verse_pee: boolean;
  };
  per: { statut: string; source: string; deductible: boolean; bloque_jusqu_retraite: boolean };
  assurance_vie: {
    statut: string;
    source: string;
    seuil_anciennete_annees: number;
    abattement_annuel_solo: number;
    abattement_annuel_couple: number;
  };
  pea: { statut: string; source: string; seuil_exoneration_ir_annees: number; ps_toujours_dus: boolean };
  plafonnement_niches_fiscales: { statut: string; source: string; montant: number };
}

export interface LeverResult {
  leverId: string;
  coutNet: CoutNet;
  gainEstimeEuros: number | null; // null si non chiffrable sans plus d'info
  texteCalcul: string; // "À ta TMI de 30%, 1 000 € → ~300 € d'IR en moins"
  avertissement?: string; // ex. "Argent bloqué jusqu'à la retraite"
}

export interface Lever {
  id: string;
  titre: string;
  coutNet: CoutNet;
  moduleId: string;
  prioriteBase: number; // 0 = max
  eligible: (p: UserProfile) => boolean;
  calcule: (p: UserProfile, params: FiscalParams) => LeverResult;
  ouAgir: string[];
  sources: string[];
}

export interface Surveillance {
  parametre: string;
  leviers: string[];
  nature_risque: string;
  statut_actuel: string;
  probabilite_evolution: 'ELEVEE' | 'MOYENNE' | 'RECURRENTE' | 'A_CONFIRMER' | string;
  horizon: string;
  nuance?: string;
  source: string;
}

export interface VeilleFiscale {
  date_maj: string;
  plf_en_cours: boolean;
  surveillances: Surveillance[];
}
