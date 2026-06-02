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
//
// IMPORTANT — format DGFiP : l'avis est en COLONNES. pdf.js lit d'abord tous les
// libellés, puis tous les nombres dans un bloc détaché. On combine donc : extraction
// par proximité (format simple) + replis best-effort (plus fréquent, soulignements).
// L'utilisateur valide/complète toujours avant que ça touche un calcul.

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

// Un nombre qui ressemble à une année (renvoi de calendrier fiscal) -> à ignorer.
function estAnnee(n) {
  return Number.isInteger(n) && n >= 1990 && n <= 2099;
}

// Montant monétaire STRICT : soit une suite simple de 4 à 7 chiffres (74390),
// soit un groupement français des milliers — 1 à 3 chiffres puis des groupes de
// EXACTEMENT 3 chiffres séparés par une espace ou un point (74 390 ; 1.234.567). Les
// numéros de référence/identifiants (« 09 44 284 614 049 ») ont un groupement irrégulier
// et ne matchent donc PAS — c'est ce qui évite de coller des chiffres parasites. Borné
// à 9 M€ pour exclure téléphones/identifiants restants.
const MONTANT_MAX_PLAUSIBLE = 9000000;
function montantsStricts(text) {
  const re = /\b\d{1,3}(?:[   ]\d{3})+\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d{4,7}\b/g;
  return [...String(text).matchAll(re)]
    .map((x) => toNumber(x[0]))
    .filter((v) => v != null && v >= 1000 && v <= MONTANT_MAX_PLAUSIBLE && !estAnnee(v));
}

// ── Extracteurs spécialisés ───────────────────────────────────────

// TMI : on relève TOUS les pourcentages du document et on garde celui qui
// correspond à une tranche connue du barème (0/11/30/41/45 %). C'est fiable même
// quand le pourcentage est détaché de son libellé (cas réel des avis DGFiP).
function extraireTMI(text) {
  const tranches = [0, 0.11, 0.3, 0.41, 0.45];
  const pourcentages = [...text.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)]
    .map((m) => toNumber(m[1]) / 100)
    .filter((v) => v != null);
  const candidats = pourcentages.filter((v) => tranches.some((t) => Math.abs(t - v) < 0.005));
  if (candidats.length === 0) return null;
  return Math.max(...candidats); // TMI = tranche marginale = la plus haute applicable
}

// Taux moyen : pourcentage explicitement étiqueté, sinon null.
function extraireTauxMoyen(text) {
  const m = text.match(/taux\s+moyen\s+d['e\s]*imposition[^%]{0,200}?(\d{1,2}[.,]\d{1,2})\s*%/i);
  return m ? toNumber(m[1]) / 100 : null;
}

// Nombre de parts : valide si 1 à 15 ET multiple de 0,25 (les parts vont de 0,25 en 0,25).
function partsValide(n) {
  return n != null && n >= 1 && n <= 15 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
}

// Nombre de parts. 1) libellé explicite « Nombre de parts ... 1,5 ». 2) repli format
// réel DGFiP : la valeur (ex. « 1,00 ») précède immédiatement « IMPOT SUR LE REVENU ».
function extraireParts(text) {
  const m = text.match(/nombre\s+de\s+parts[^\d]{0,30}(\d(?:[.,]\d{1,2})?)\b/i);
  if (m) {
    const n = toNumber(m[1]);
    if (partsValide(n)) return n;
  }
  const m2 = text.match(/(\d(?:[.,]\d{1,2})?)\s*(?:IMPOT|IMPÔT)\s+SUR\s+LE\s+REVENU/i);
  if (m2) {
    const n = toNumber(m2[1]);
    if (partsValide(n)) return n;
  }
  return null;
}

// Personnes à charge (enfants). Libellé explicite sur l'avis (« Nombre de personnes
// à charge … 2 »), best-effort. Borné 0–12. À défaut null (l'usager saisira/confirmera).
function extrairePersonnesACharge(text) {
  const m = text.match(/(?:nombre\s+de\s+)?personnes?\s+à\s+charge[^\d]{0,30}(\d{1,2})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 0 && n <= 12) return n;
  }
  return null;
}

// Montant >= 1000 le plus proche après le libellé (format simple : libellé↔valeur proches).
function extraireGrandNombre(text, labelRegex) {
  const m = text.match(labelRegex);
  if (!m) return null;
  const apres = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
  const nums = montantsStricts(apres);
  return nums.length ? nums[0] : null;
}

// Repli (format colonnaire DGFiP) : le revenu net imposable est RÉPÉTÉ sur l'avis
// (salaires nets, revenu brut global, total…). On prend le montant le PLUS FRÉQUENT
// (apparu >= 2 fois). À défaut, null.
function nombreLePlusFrequent(nums) {
  const c = new Map();
  let best = null;
  let bestN = 0;
  for (const n of nums) {
    const k = (c.get(n) || 0) + 1;
    c.set(n, k);
    if (k > bestN || (k === bestN && best != null && n > best)) { bestN = k; best = n; }
  }
  return bestN >= 2 ? best : null;
}

// Repli pour l'impôt net : total encadré de soulignements « ___ 13 576 ___ ».
function impotEntreSoulignements(text) {
  const nums = [...text.matchAll(/_[\s_]*(\d[\d   .]{2,})\s*_/g)]
    .map((x) => toNumber(x[1]))
    .filter((v) => v != null && v >= 1000 && !estAnnee(v));
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Parse le texte brut d'un avis d'imposition (extraction best-effort, validée par l'usager).
 * @param {string} rawText texte extrait localement (pdf.js / OCR)
 * @returns {{champs:object, confiance:string, avertissements:string[]}}
 */
export function parseAvisText(rawText) {
  const text = String(rawText || '').replace(/[\r\n]+/g, ' ');

  const tmi = extraireTMI(text);
  const grands = montantsStricts(text);
  const frequent = nombreLePlusFrequent(grands); // souvent = revenu net imposable

  const champs = {
    // 1) proximité libellé↔valeur (format simple) ; 2) repli "plus fréquent" (colonnaire).
    revenuNetImposable: extraireGrandNombre(text, /revenu\s+(?:net\s+)?imposable/i) || frequent,
    revenuFiscalReference: extraireGrandNombre(text, /revenu\s+fiscal\s+de\s+r[ée]f[ée]rence/i),
    nombreParts: extraireParts(text),
    personnesACharge: extrairePersonnesACharge(text),
    tmi,
    tauxMoyen: extraireTauxMoyen(text),
    // Plafond PER : lignes multiples (total, non utilisé, calculé…) -> trop ambigu, saisie.
    plafondPER: null,
    impotNet: extraireGrandNombre(text, /imp[ôo]t\s+net/i) || impotEntreSoulignements(text),
  };

  // RFR : uniquement par proximité du libellé (un "plus grand montant" capterait des
  // numéros parasites — téléphone, référence). Non utilisé dans les calculs : vide > faux.

  // Garde-fous de cohérence (valeurs aberrantes => on annule).
  const avertissements = [];
  if (champs.nombreParts != null && (champs.nombreParts < 1 || champs.nombreParts > 15)) {
    champs.nombreParts = null;
  }
  if (champs.revenuNetImposable != null && champs.revenuNetImposable < 0) {
    champs.revenuNetImposable = null;
  }

  avertissements.push(
    "Valeurs lues automatiquement : vérifie chaque montant ci-dessous (et complète ceux laissés vides) avant de valider. En cas de doute, recopie depuis ton avis.",
  );

  // Niveau de confiance = combien de champs clés ont été trouvés.
  const cles = ['revenuNetImposable', 'nombreParts', 'tmi'];
  const trouves = cles.filter((k) => champs[k] != null).length;
  const confiance = trouves >= 2 ? 'BONNE' : trouves === 1 ? 'PARTIELLE' : 'FAIBLE';

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
  // Personnes à charge validées par l'usager : mettent à jour la composition familiale
  // (nbCharges) utilisée pour l'adéquation des aides/niches (« adapté » vs « à explorer »).
  if (champs.personnesACharge != null) patch.nbCharges = Math.max(0, Math.round(champs.personnesACharge));
  // Cohérence avec Q3 : si l'avis montre un impôt nul, l'usager est non imposable.
  if (champs.impotNet != null) patch.estImposable = champs.impotNet > 0 ? 'OUI' : 'NON';
  return patch;
}
