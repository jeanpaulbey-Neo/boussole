// Tests du parser d'avis d'imposition + intégration moteur (TMI exacte, plafond PER).
// Lance : node test/avis.test.mjs
import { parseAvisText, profilDepuisAvis } from '../js/avis.js';
import { estimeTMI, tmiIncertaine, CATALOGUE } from '../js/engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const params = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/data/fiscal-params.json', import.meta.url))));

let pass = 0, fail = 0;
const check = (n, c, d = '') => (c ? (pass++, console.log('✓', n)) : (fail++, console.error('✗', n, d)));

// ── 1) Format "simple" (libellés et valeurs proches) ─────────────────────────
const AVIS = `
DIRECTION GÉNÉRALE DES FINANCES PUBLIQUES
Avis d'impôt 2026 sur les revenus de 2025
Nombre de parts : 2,5
Revenu net imposable .......... 48 200
Revenu fiscal de référence .... 49 100
Impôt net ..................... 3 412
Taux marginal d'imposition : 30 %
Taux moyen d'imposition : 7,08 %
`;
const r = parseAvisText(AVIS);
check('revenu net imposable = 48200', r.champs.revenuNetImposable === 48200, `=> ${r.champs.revenuNetImposable}`);
check('RFR = 49100', r.champs.revenuFiscalReference === 49100, `=> ${r.champs.revenuFiscalReference}`);
check('nombre de parts = 2.5', r.champs.nombreParts === 2.5, `=> ${r.champs.nombreParts}`);
check('TMI = 0.30', Math.abs(r.champs.tmi - 0.30) < 1e-9, `=> ${r.champs.tmi}`);
check('taux moyen = 0.0708', Math.abs(r.champs.tauxMoyen - 0.0708) < 1e-9, `=> ${r.champs.tauxMoyen}`);
check('impôt net = 3412', r.champs.impotNet === 3412, `=> ${r.champs.impotNet}`);
// PER non auto-extrait (format trop ambigu) -> saisie manuelle.
check('plafond PER non deviné (null)', r.champs.plafondPER === null, `=> ${r.champs.plafondPER}`);
check('confiance BONNE', r.confiance === 'BONNE', `=> ${r.confiance}`);

// ── 2) Patch de profil ───────────────────────────────────────────────────────
const patch = profilDepuisAvis(r.champs);
check('patch.sourceAvis = true', patch.sourceAvis === true);
check('patch.tmiExacte = 0.30', Math.abs(patch.tmiExacte - 0.30) < 1e-9);
check('impôt net > 0 => estImposable OUI', patch.estImposable === 'OUI');

// ── 3) Moteur : TMI exacte prioritaire sur l'heuristique de tranche ──────────
const profil = {
  estImposable: 'OUI', revenuMensuelFoyer: '>6000', capaciteEpargne: '>300',
  epargnePrecaution: 'OUI', nbCharges: 1, situationFamiliale: 'COUPLE',
  ...patch,
};
check('TMI exacte prise en compte (30 %, pas 41 %)', estimeTMI(profil) === 0.30, `=> ${estimeTMI(profil)}`);
check('plus d\'incertitude TMI avec avis', tmiIncertaine(profil) === false);

// ── 4) PER borné au plafond SAISI manuellement (plafondPERExact) ─────────────
const profilPER = { ...profil, plafondPERExact: 4114 };
const per = CATALOGUE.find((l) => l.id === 'per').calcule(profilPER, params);
check('PER : gain ≈ 4114 * 0.30', Math.abs(per.gainEstimeEuros - 4114 * 0.30) < 0.5, `=> ${per.gainEstimeEuros}`);
const perSansEspaces = per.texteCalcul.replace(/\s/g, '').normalize();
check('PER : texte mentionne le plafond saisi', perSansEspaces.includes('4114'), `=> ${per.texteCalcul}`);

// ── 5) Format RÉEL colonnaire (anti-régression : pas de fausses valeurs) ─────
// Extrait reformulé d'un vrai avis DGFiP : libellés et valeurs détachés, années et
// numéros de renvoi présents. Le parser ne doit PAS prendre 2025 (année) ni 25 (renvoi).
const REEL = `Revenu imposable Impôt net Revenu fiscal de référence 25 ` +
  `PLAFOND EPARGNE RETRAITE Le plafond disponible pour la déduction des cotisations ` +
  `versées en 2025, pour la déclaration des revenus à souscrire en 2026 est de : ` +
  `Plafond calculé sur les revenus de 2024 Taux moyen d'imposition Taux marginal d'imposition ` +
  `18,14% 30,00% 74390 13576 74839`;
const rr = parseAvisText(REEL);
check('REEL: TMI = 30 % (bracket-match, pas 18,14)', rr.champs.tmi === 0.30, `=> ${rr.champs.tmi}`);
check('REEL: PER pas pollué par l\'année 2025', rr.champs.plafondPER === null, `=> ${rr.champs.plafondPER}`);
check('REEL: RFR pas pollué par le renvoi 25', rr.champs.revenuFiscalReference !== 25, `=> ${rr.champs.revenuFiscalReference}`);

// ── 6) Avis illisible => FAIBLE + avertissement, pas de crash ────────────────
const vide = parseAvisText('document flou sans chiffres exploitables');
check('texte inexploitable => FAIBLE', vide.confiance === 'FAIBLE', `=> ${vide.confiance}`);
check('avertissement présent', vide.avertissements.length > 0);

// ── 7) Robustesse des formats numériques ─────────────────────────────────────
const r2 = parseAvisText('Revenu net imposable : 1.234.567 Taux marginal d\'imposition : 41,00 %');
check('séparateur milliers "." => 1234567', r2.champs.revenuNetImposable === 1234567, `=> ${r2.champs.revenuNetImposable}`);
check('TMI "41,00 %" => 0.41', Math.abs(r2.champs.tmi - 0.41) < 1e-9, `=> ${r2.champs.tmi}`);

console.log(`\n${pass} OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
