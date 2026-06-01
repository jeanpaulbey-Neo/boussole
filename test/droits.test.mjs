// Tests d'adéquation des droits sociaux au profil (engine.adequationDroits).
import { adequationDroits } from '../js/engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aides = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/droits-sociaux.json', import.meta.url)))).aides;

let pass = 0, fail = 0;
const check = (n, c, d = '') => (c ? (pass++, console.log('✓', n)) : (fail++, console.error('✗', n, d)));
const stat = (res, id) => (res.find((r) => r.aide.id === id) || {}).statut;

// Profil A : foyer modeste, locataire, 2 enfants, salarié.
const A = {
  situationFamiliale: 'COUPLE', nbCharges: 2, revenuMensuelFoyer: '1500-2500',
  statut: 'SALARIE', logement: 'LOCATAIRE',
};
const rA = adequationDroits(A, aides);
check('toutes les aides classées', rA.length === aides.length);
check('chaque statut valide', rA.every((r) => ['PRIORITAIRE', 'A_EXPLORER', 'PEU_PROBABLE'].includes(r.statut)));
check('chaque aide a une raison', rA.every((r) => typeof r.raison === 'string' && r.raison.length > 0));
check('A: prime d\'activité prioritaire', stat(rA, 'prime_activite') === 'PRIORITAIRE');
check('A: aide au logement prioritaire (locataire, revenu modeste)', stat(rA, 'aide_logement') === 'PRIORITAIRE');
check('A: allocations familiales prioritaire (2 enfants)', stat(rA, 'allocations_familiales') === 'PRIORITAIRE');
check('A: AAH à explorer (handicap non mesuré)', stat(rA, 'aah') === 'A_EXPLORER');

// Profil B : revenus élevés, propriétaire, sans enfant.
const B = {
  situationFamiliale: 'COUPLE', nbCharges: 0, revenuMensuelFoyer: '>6000',
  statut: 'SALARIE', logement: 'PROPRIO_RP',
};
const rB = adequationDroits(B, aides);
check('B: RSA peu probable (revenu élevé)', stat(rB, 'rsa') === 'PEU_PROBABLE');
check('B: aide au logement peu probable (propriétaire)', stat(rB, 'aide_logement') === 'PEU_PROBABLE');
check('B: allocations familiales peu probable (0 enfant)', stat(rB, 'allocations_familiales') === 'PEU_PROBABLE');

// Profil C : parent isolé -> ASF prioritaire ; sans emploi -> ASS.
const C = { situationFamiliale: 'PARENT_ISOLE', nbCharges: 1, revenuMensuelFoyer: '1500-2500', statut: 'SANS_EMPLOI', logement: 'LOCATAIRE' };
const rC = adequationDroits(C, aides);
check('C: ASF prioritaire (parent isolé, 1 enfant)', stat(rC, 'asf') === 'PRIORITAIRE');
check('C: ASS prioritaire (sans emploi)', stat(rC, 'ass') === 'PRIORITAIRE');

const D = { situationFamiliale: 'CELIBATAIRE', nbCharges: 0, revenuMensuelFoyer: '1500-2500', statut: 'RETRAITE', logement: 'LOCATAIRE' };
const rD = adequationDroits(D, aides);
check('D: ASPA prioritaire (retraité, revenu modeste)', stat(rD, 'aspa') === 'PRIORITAIRE');
check('D: APA prioritaire (retraité)', stat(rD, 'apa') === 'PRIORITAIRE');
check('D: ASF peu probable (pas parent isolé)', stat(rD, 'asf') === 'PEU_PROBABLE');

console.log(`\n${pass} OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
