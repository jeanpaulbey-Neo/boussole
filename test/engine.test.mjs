// Tests du moteur (sans dépendance). Couvre : barème IR (vérification RUNBOOK),
// crédit emploi domicile, pivot non-imposable, filtre zéro dépense, tri par coût net.
// Lance : node test/engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcIR, orienter, estimeTMI, CATALOGUE } from '../js/engine.js';

const params = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/fiscal-params.json', import.meta.url))));
const veille = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/veille-fiscale.json', import.meta.url))));

let pass = 0, fail = 0;
function check(nom, cond, detail = '') {
  if (cond) { pass++; console.log(`✓ ${nom}`); }
  else { fail++; console.error(`✗ ${nom} ${detail}`); }
}
function near(a, b, tol = 2) { return Math.abs(a - b) <= tol; }

// 1) Barème IR — RUNBOOK Verification : célibataire 1 part, 30 000 € → ≈ 2 104 €
const ir = calcIR(30000, 1, params);
check('IR célibataire 1 part 30 000 € ≈ 2 104 €', near(ir, 2104, 2), `=> ${ir}`);

// IR couple 2 parts 60 000 € = 2 × (IR 30 000 / part) → ≈ 4 208 €
check('IR 2 parts 60 000 € ≈ 4 208 €', near(calcIR(60000, 2, params), 4208, 4), `=> ${calcIR(60000, 2, params)}`);

// Sous le 1er seuil : impôt nul
check('IR sous le seuil = 0', calcIR(10000, 1, params) === 0);

// 2) Crédit emploi domicile : 2 400 € de dépense → 1 200 € (50 %), remboursable
const lev = CATALOGUE.find((l) => l.id === 'credit_domicile');
const profilBase = {
  situationFamiliale: 'CELIBATAIRE', nbCharges: 0, estImposable: 'OUI', revenuMensuelFoyer: '2500-4000',
  statut: 'SALARIE', emploiDomicile: 'OUI', dons: 'NON', epargneSalariale: 'NON', epargnePrecaution: 'OUI',
  capaciteEpargne: '100-300', logement: 'LOCATAIRE', fraisProEleves: 'NON', creditsEnCours: 'NON',
  objectif: 'IMPOTS', situationParticuliere: 'AUCUNE', filtreZeroDepense: true,
};
const rCredit = lev.calcule(profilBase, params);
check('Crédit domicile 2 400 € → 1 200 €', rCredit.gainEstimeEuros === 1200, `=> ${rCredit.gainEstimeEuros}`);

// 3) TMI
check('TMI 2500-4000 = 30 %', estimeTMI(profilBase) === 0.3);
check('TMI forcée à 0 si non imposable', estimeTMI({ ...profilBase, estImposable: 'NON' }) === 0);

// 4) Pivot non-imposable : per & dons retirés, gratuits boostés
const profilNonImp = { ...profilBase, estImposable: 'NON', dons: 'REGULIER', revenuMensuelFoyer: '<1500' };
const outNI = orienter(profilNonImp, params, veille);
check('Non-imposable : pas de levier "dons"', !outNI.leviers.some((x) => x.lever.id === 'dons'));
check('Non-imposable : pas de levier "per"', !outNI.leviers.some((x) => x.lever.id === 'per'));

// 5) Filtre zéro dépense : aucun levier DEPENSE
const profilDons = { ...profilBase, dons: 'REGULIER', filtreZeroDepense: true };
const outZero = orienter(profilDons, params, veille);
check('Filtre zéro dépense : aucun levier DEPENSE', outZero.leviers.every((x) => x.result.coutNet !== 'DEPENSE'));
const outAvecDepense = orienter({ ...profilDons, filtreZeroDepense: false }, params, veille);
check('Filtre désactivé : "dons" peut apparaître', outAvecDepense.leviers.some((x) => x.lever.id === 'dons'));

// 6) Tri : coût net croissant (GRATUIT avant REORIENTATION avant DEPENSE)
const ordre = { GRATUIT: 0, REORIENTATION: 1, DEPENSE: 2 };
const couts = outAvecDepense.leviers.map((x) => ordre[x.result.coutNet]);
check('Tri par coût net croissant', couts.every((v, i) => i === 0 || couts[i - 1] <= v), `=> ${couts}`);

// 7) Matelas : sans épargne de précaution, pas de PER/PEA + bannière
const outSansMatelas = orienter({ ...profilBase, epargnePrecaution: 'NON', capaciteEpargne: '>300' }, params, veille);
check('Sans matelas : pas de PER/PEA', !outSansMatelas.leviers.some((x) => ['per', 'pea'].includes(x.lever.id)));
check('Sans matelas : bannière présente', outSansMatelas.bannieres.some((b) => b.includes('matelas')));

// 8) Drapeau pro
const outPro = orienter({ ...profilBase, situationParticuliere: 'SUCCESSION' }, params, veille);
check('Situation particulière → encart pro', outPro.encartPro === true);

// 9) Bandeau veille rattaché (credit_domicile = surveillance ELEVEE)
const outVeille = orienter(profilBase, params, veille);
check('Veille rattachée au crédit domicile', outVeille.leviers.some((x) => x.lever.id === 'credit_domicile' && x.surveillance));

// 10) PASS = 48 060 (et surtout pas 47 100)
check('PASS 2026 = 48 060 €', params.epargne_salariale.pass === 48060, `=> ${params.epargne_salariale.pass}`);

console.log(`\n${pass} OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
