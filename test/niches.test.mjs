// Tests d'adéquation des niches fiscales au profil (engine.adequationNiches).
import { adequationNiches } from '../js/engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const niches = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/niches-fiscales.json', import.meta.url)))).niches;
const params = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/fiscal-params.json', import.meta.url))));

let pass = 0, fail = 0;
const check = (n, c, d = '') => (c ? (pass++, console.log('✓', n)) : (fail++, console.error('✗', n, d)));
const base = {
  situationFamiliale: 'COUPLE', nbCharges: 2, estImposable: 'OUI', revenuMensuelFoyer: '2500-4000',
  statut: 'SALARIE', emploiDomicile: 'OUI', dons: 'REGULIER', epargneSalariale: 'OUI',
  epargnePrecaution: 'OUI', capaciteEpargne: '>300', logement: 'PROPRIO_BAILLEUR',
  fraisProEleves: 'OUI', creditsEnCours: 'NON', objectif: 'RETRAITE', situationParticuliere: 'AUCUNE',
  filtreZeroDepense: true,
};
const stat = (res, id) => res.find((r) => r.niche.id === id).statut;

// 1) Toutes les niches sont classées, sans crash.
const rA = adequationNiches(base, niches, params);
check('toutes les niches classées', rA.length === niches.length);
check('chaque statut valide', rA.every((r) => ['ADAPTEE', 'SOUS_CONDITIONS', 'SANS_OBJET'].includes(r.statut)));

// 2) Profil imposable 30% + bailleur + épargne : dons/PER/déficit/frais adaptés.
check('A: dons ADAPTEE', stat(rA, 'dons') === 'ADAPTEE');
check('A: per ADAPTEE', stat(rA, 'per') === 'ADAPTEE');
check('A: déficit foncier ADAPTEE', stat(rA, 'deficit_foncier') === 'ADAPTEE');
check('A: crédit domicile ADAPTEE', stat(rA, 'credit_emploi_domicile') === 'ADAPTEE');

// 3) Non imposable : déductions/réductions SANS_OBJET.
const B = { ...base, estImposable: 'NON', revenuMensuelFoyer: '<1500', dons: 'NON', logement: 'LOCATAIRE' };
const rB = adequationNiches(B, niches, params);
check('B: per SANS_OBJET', stat(rB, 'per') === 'SANS_OBJET');
check('B: dons SANS_OBJET', stat(rB, 'dons') === 'SANS_OBJET');
check('B: frais réels SANS_OBJET', stat(rB, 'frais_reels') === 'SANS_OBJET');

// 4) Imposable mais SANS matelas : PER/PEA SOUS_CONDITIONS (garde-fou).
const C = { ...base, epargnePrecaution: 'NON' };
const rC = adequationNiches(C, niches, params);
check('C: per SOUS_CONDITIONS (pas de matelas)', stat(rC, 'per') === 'SOUS_CONDITIONS');
check('C: pea SOUS_CONDITIONS (pas de matelas)', stat(rC, 'pea') === 'SOUS_CONDITIONS');

console.log(`\n${pass} OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
