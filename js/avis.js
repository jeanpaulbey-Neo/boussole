// Extraction des données utiles d'un avis d'imposition (SPEC §5 v2, §12).
//
// PRINCIPE DE CONFIDENTIALITÉ (SPEC §1/§10) : tout se passe SUR L'APPAREIL.
// Ce module ne reçoit que du TEXTE déjà extrait localement (par pdf.js ou tesseract.js) ;
// il n'émet AUCUN appel réseau, ne stocke rien, ne renvoie que ~5 nombres. Le document
// d'origine n'est jamais transmis ni conservé. L'utilisateur VALIDE toujours les valeurs
// extraites avant qu'elles ne touchent un calcul (l'OCR/parsing peut se tromper).
//
// On ne code AUCUN paramètre fiscal ici : on lit ce qui est imprimé sur l'avis de
// l'usager (revenu, parts, TMI, plafond PER) — précisément les valeurs que la SPEC
// interdit de coder en dur.

// Espaces "exotiques" fréquents dans les PDF DGFiP : insécable ( ), fine ( ).
const NUM = '[\\d\\s\\u00A0\\u202F.,]';

// Normalise un nombre français : "48 060", "1.234,56", "12 000 €" -> number
function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw)
    .replace(/[\s  ]/g, '') // tous les espaces, y compris insécables / fines
    .replace(/€/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // séparateur de milliers "."
    .replace(',', '.'); // décimale française
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Normalise un pourcentage : "30 %", "30,00%", "0,30" -> 0.30 (fraction)
function toRate(raw) {
  const n = toNumber(raw);
  if (n == null) return null;
  return n > 1 ? n / 100 : n; // "30" -> 0.30 ; "0.3" -> 0.3
}

// Libellés rencontrés sur les avis DGFiP (variations d'année en année).
// Chaque champ : liste de regex ; on prend la 1re capture trouvée.
const PATTERNS = {
  revenuNetImposable: [
    new RegExp(`revenu\\s+net\\s+imposable[^\\d]{0,40}(${NUM}+)`, 'i'),
    new RegExp(`revenu\\s+imposable[^\\d]{0,40}(${NUM}+)`, 'i'),
  ],
  revenuFiscalReference: [
    new RegExp(`revenu\\s+fiscal\\s+de\\s+r[ée]f[ée]rence[^\\d]{0,40}(${NUM}+)`, 'i'),
    new RegExp(`\\bRFR\\b[^\\d]{0,20}(${NUM}+)`, 'i'),
  ],
  nombreParts: [
    /nombre\s+de\s+parts[^\d]{0,40}([\d]+[.,]?\d*)/i,
    /quotient\s+familial[^\d]{0,40}([\d]+[.,]?\d*)\s*parts?/i,
  ],
  tmi: [
    /taux\s+marginal\s+d['e\s]*imposition[^\d]{0,40}([\d]+[.,]?\d*)\s*%/i,
    /TMI[^\d]{0,20}([\d]+[.,]?\d*)\s*%/i,
  ],
  tauxMoyen: [/taux\s+moyen\s+d['e\s]*imposition[^\d]{0,40}([\d]+[.,]?\d*)\s*%/i],
  // Le plafond PER (épargne retraite) figure dans le cadre "plafond épargne retraite".
  plafondPER: [
    new RegExp(`plafond[^\\n]{0,40}(?:[ée]pargne\\s+retraite|d[ée]duction)[^\\d]{0,60}(${NUM}{4,})`, 'i'),
    new RegExp(`disponible[^\\n]{0,30}retraite[^\\d]{0,40}(${NUM}{4,})`, 'i'),
  ],
  impotNet: [
    new RegExp(`imp[ôo]t\\s+net[^\\d]{0,40}(${NUM}+)`, 'i'),
    new RegExp(`montant\\s+de\\s+(?:votre\\s+)?imp[ôo]t[^\\d]{0,40}(${NUM}+)`, 'i'),
  ],
};

function firstMatch(text, regexes, conv) {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1] != null) {
      const v = conv(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

/**
 * Parse le texte brut d'un avis d'imposition.
 * @param {string} rawText texte extrait localement (pdf.js / OCR)
 * @returns {{champs:object, confiance:string, avertissements:string[]}}
 */
export function parseAvisText(rawText) {
  const text = String(rawText || '').replace(/\r/g, ' ');
  const champs = {
    revenuNetImposable: firstMatch(text, PATTERNS.revenuNetImposable, toNumber),
    revenuFiscalReference: firstMatch(text, PATTERNS.revenuFiscalReference, toNumber),
    nombreParts: firstMatch(text, PATTERNS.nombreParts, toNumber),
    tmi: firstMatch(text, PATTERNS.tmi, toRate),
    tauxMoyen: firstMatch(text, PATTERNS.tauxMoyen, toRate),
    plafondPER: firstMatch(text, PATTERNS.plafondPER, toNumber),
    impotNet: firstMatch(text, PATTERNS.impotNet, toNumber),
  };

  // Garde-fous de cohérence (valeurs aberrantes => on annule + on signale).
  const avertissements = [];
  if (champs.nombreParts != null && (champs.nombreParts < 1 || champs.nombreParts > 15)) {
    avertissements.push('Nombre de parts hors plage plausible — à vérifier.');
    champs.nombreParts = null;
  }
  if (champs.tmi != null && ![0, 0.11, 0.3, 0.41, 0.45].some((t) => Math.abs(t - champs.tmi) < 0.011)) {
    avertissements.push('Le taux marginal lu ne correspond pas à une tranche connue — à vérifier.');
  }
  if (champs.revenuNetImposable != null && champs.revenuNetImposable < 0) {
    champs.revenuNetImposable = null;
  }

  // Niveau de confiance = combien de champs clés ont été trouvés.
  const cles = ['revenuNetImposable', 'nombreParts', 'tmi'];
  const trouves = cles.filter((k) => champs[k] != null).length;
  const confiance = trouves >= 2 ? 'BONNE' : trouves === 1 ? 'PARTIELLE' : 'FAIBLE';
  if (confiance !== 'BONNE') {
    avertissements.push("Lecture incomplète : complète ou corrige les champs à la main avant de valider.");
  }

  return { champs, confiance, avertissements };
}

/**
 * Construit un patch de UserProfile à partir des champs validés par l'utilisateur.
 * On NE remplace que ce qui est fiable ; le reste du profil déclaratif est conservé.
 * Pose un flag `sourceAvis` pour que le moteur sache qu'il peut utiliser la TMI exacte.
 */
export function profilDepuisAvis(champs) {
  const patch = { sourceAvis: true };
  if (champs.tmi != null) patch.tmiExacte = champs.tmi;
  if (champs.revenuNetImposable != null) patch.revenuNetImposableExact = champs.revenuNetImposable;
  if (champs.nombreParts != null) patch.nombrePartsExact = champs.nombreParts;
  if (champs.plafondPER != null) patch.plafondPERExact = champs.plafondPER;
  // Cohérence avec Q3 : si l'avis montre un impôt nul, l'usager est non imposable.
  if (champs.impotNet != null) patch.estImposable = champs.impotNet > 0 ? 'OUI' : 'NON';
  return patch;
}
