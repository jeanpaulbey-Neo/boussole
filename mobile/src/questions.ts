// Profilage — 15 questions (SPEC §5). Partagé par l'écran de profilage.
import { UserProfile } from '@shared/engine/types';

export interface Question {
  field: keyof UserProfile;
  q: string;
  opts: [string | number, string][];
}

export const QUESTIONS: Question[] = [
  { field: 'situationFamiliale', q: 'Situation familiale ?', opts: [['CELIBATAIRE', 'Célibataire'], ['COUPLE', 'En couple'], ['PARENT_ISOLE', 'Parent isolé']] },
  { field: 'nbCharges', q: 'Enfants ou personnes à charge ?', opts: [[0, '0'], [1, '1'], [2, '2'], [3, '3 +']] },
  { field: 'estImposable', q: "Payez-vous de l'impôt sur le revenu ?", opts: [['OUI', 'Oui'], ['NON', 'Non'], ['INCONNU', 'Je ne sais pas']] },
  { field: 'revenuMensuelFoyer', q: 'Revenu net mensuel du foyer ?', opts: [['<1500', 'Moins de 1 500 €'], ['1500-2500', '1 500 – 2 500 €'], ['2500-4000', '2 500 – 4 000 €'], ['4000-6000', '4 000 – 6 000 €'], ['>6000', 'Plus de 6 000 €']] },
  { field: 'statut', q: 'Statut professionnel ?', opts: [['SALARIE', 'Salarié'], ['INDEPENDANT', 'Indépendant'], ['FONCTIONNAIRE', 'Fonctionnaire'], ['RETRAITE', 'Retraité'], ['SANS_EMPLOI', 'Sans emploi']] },
  { field: 'emploiDomicile', q: "Employez-vous (ou pourriez) quelqu'un à domicile ?", opts: [['OUI', 'Oui'], ['NON', 'Non'], ['POSSIBLE', 'Pas encore mais possible']] },
  { field: 'dons', q: 'Faites-vous des dons ?', opts: [['REGULIER', 'Régulièrement'], ['OCCASIONNEL', 'Occasionnellement'], ['NON', 'Non']] },
  { field: 'epargneSalariale', q: 'Épargne salariale proposée (PEE, intéressement) ?', opts: [['OUI', 'Oui'], ['NON', 'Non'], ['INCONNU', 'Je ne sais pas']] },
  { field: 'epargnePrecaution', q: 'Épargne de précaution (~3 mois de dépenses) ?', opts: [['OUI', 'Oui'], ['PARTIEL', 'Partiellement'], ['NON', 'Non']] },
  { field: 'capaciteEpargne', q: "Capacité d'épargne mensuelle ?", opts: [['AUCUNE', 'Aucune'], ['<100', 'Moins de 100 €'], ['100-300', '100 – 300 €'], ['>300', 'Plus de 300 €']] },
  { field: 'logement', q: 'Logement ?', opts: [['LOCATAIRE', 'Locataire'], ['PROPRIO_RP', 'Propriétaire (résidence principale)'], ['PROPRIO_BAILLEUR', 'Propriétaire bailleur']] },
  { field: 'fraisProEleves', q: 'Trajets longs / frais pro élevés ?', opts: [['OUI', 'Oui'], ['NON', 'Non']] },
  { field: 'creditsEnCours', q: 'Crédits en cours ?', opts: [['OUI', 'Oui'], ['NON', 'Non']] },
  { field: 'objectif', q: 'Objectif prioritaire ?', opts: [['SECURISER', 'Sécuriser'], ['PROJET', 'Projet 5–10 ans'], ['RETRAITE', 'Retraite'], ['IMPOTS', "Réduire l'impôt"]] },
  { field: 'situationParticuliere', q: 'Situation particulière en vue ?', opts: [['SUCCESSION', 'Succession'], ['EXPATRIATION', 'Expatriation'], ['CREATION_ENTREPRISE', "Création d'entreprise"], ['GROS_PATRIMOINE', 'Gros patrimoine'], ['AUCUNE', 'Aucune']] },
];
