// Tests du parser d'avis d'imposition + intégration moteur (TMI exacte, plafond PER réel).
// Lance : node test/avis.test.mjs
import { parseAvisText, profilDepuisAvis } from '../js/avis.js';
import { estimeTMI, tmiIncertaine, CATALOGUE } from '../js/engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const params = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/fiscal-params.json', import.meta.url))));

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log('✓', n)) : (fail++, console.error('✗', n, d));

// Texte type d'un avis DGFiP (extraits réels reformulés, valeurs fictives).
const AVIS = `
DIRECTION GÉNÉRALE DES FINANCES PUBLIQUES
Avis d'impôt 2026 sur les revenus de 2025
Nombre de parts : 2,5
Revenu brut global ............ 52 300
Revenu net imposable .......... 48 200
Revenu fiscal de référence .... 49 100
Impôt net ..................... 3 412
Taux marginal d'imposition : 30 %
Taux moyen d'imposition : 7,08 %
Plafond épargne retraite (PER) disponible : 4 114 €
`;

// 1) Extraction des champs
const r = parseAvisText(AVIS);
check('revenu net imposable = 48200', r.champs.revenuNetImposable === 48200, `=> ${r.champs.revenuNetImposable}`);
check('RFR = 49100', r.champs.revenuFiscalReference === 49100, `=> ${r.champs.revenuFiscalReference}`);
check('nombre de parts = 2.5', r.champs.nombreParts === 2.5, `=> ${r.champs.nombreParts}`);
check('TMI = 0.30 (fraction)', Math.abs(r.champs.tmi - 0.30) < 1e-9, `=> ${r.champs.tmi}`);
check('taux moyen = 0.0708', Math.abs(r.champs.tauxMoyen - 0.0708) < 1e-9, `=> ${r.champs.tauxMoyen}`);
check('impôt net = 3412', r.champs.impotNet === 3412, `=> ${r.champs.impotNet}`);
check('plafond PER = 4114', r.champs.plafondPER === 4114, `=> ${r.champs.plafondPER}`);
check('confiance BONNE', r.confiance === 'BONNE', `=> ${r.confiance}`);

// 2) Conversion en patch de profil
const patch = profilDepuisAvis(r.champs);
check('patch.sourceAvis = true', patch.sourceAvis === true);
check('patch.tmiExacte = 0.30', Math.abs(patch.tmiExacte - 0.30) < 1e-9);
check('patch.plafondPERExact = 4114', patch.plafondPERExact === 4114);
check('impôt net > 0 => estImposable OUI', patch.estImposable === 'OUI');

// 3) Le moteur utilise la TMI exacte (et non l'heuristique de tranche)
// Profil dont la tranche déclarée donnerait 41 %, mais l'avis dit 30 %.
const profil = {
  estImposable: 'OUI', revenuMensuelFoyer: '>6000', capaciteEpargne: '>300',
  epargnePrecaution: 'OUI', nbCharges: 1, situationFamiliale: 'COUPLE',
  ...patch,
};
check('TMI exacte prise en compte (30 %, pas 41 %)', estimeTMI(profil) === 0.30, `=> ${estimeTMI(profil)}`);
check('plus d\'incertitude TMI avec avis', tmiIncertaine(profil) === false);

// 4) Le PER borne l'exemple au plafond réel de l'avis (4 114 €), pas l'illustratif (4 800 €)
const per = CATALOGUE.find((l) => l.id === 'per').calcule(profil, params);
check('PER : gain ≈ 4114 * 0.30', Math.abs(per.gainEstimeEuros - 4114 * 0.30) < 0.5, `=> ${per.gainEstimeEuros}`);
// On compare en retirant tous les espaces (toLocaleString peut produire des espaces
// insécables/fines selon l'environnement) : seule la présence de "4114" importe.
const perSansEspaces = per.texteCalcul.replace(/\s/g, '').normalize();
check('PER : texte mentionne le plafond de l avis', perSansEspaces.includes('4114'), `=> ${per.texteCalcul}`);

// 5) Avis illisible => confiance FAIBLE + avertissement (pas de crash)
const vide = parseAvisText('document flou sans chiffres exploitables');
check('texte inexploitable => FAIBLE', vide.confiance === 'FAIBLE', `=> ${vide.confiance}`);
check('avertissement de complétion présent', vide.avertissements.length > 0);

// 6) Robustesse des formats numériques
const r2 = parseAvisText('Revenu net imposable : 1.234.567  Nombre de parts : 1  Taux marginal d\'imposition : 41,00 %');
check('séparateur milliers "." => 1234567', r2.champs.revenuNetImposable === 1234567, `=> ${r2.champs.revenuNetImposable}`);
check('TMI "41,00 %" => 0.41', Math.abs(r2.champs.tmi - 0.41) < 1e-9, `=> ${r2.champs.tmi}`);

console.log(`\n${pass} OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
