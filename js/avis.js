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
// libellés, puis tous les nombres dans un bloc détaché. Les regex « libellé + nombre »
// sont donc peu fiables : on privilégie une extraction PRUDENTE (on préfère laisser un
// champ vide plutôt que d'y mettre une valeur fausse — année, n° de renvoi…) et on
// s'appuie sur la validation/saisie manuelle de l'utilisateur.

// Espaces "exotiques" fréquents dans les PDF DGFiP : insécable (U+00A0), fine (U+202F).
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

// Un nombre qui ressemble à une année (renvoi de calendrier fiscal) -> à ignorer.
function estAnnee(n) {
  return Number.isInteger(n) && n >= 1990 && n <= 2099;
}

// ── Extracteurs spécialisés (robustes au format colonnaire) ──────────────────

// TMI : on relève TOUS les pourcentages du document et on garde celui qui
// correspond à une tranche connue du barème (0/11/30/41/45 %). C'est fiable même
// quand le pourcentage est détaché de son libellé (cas réel des avis DGFiP).
function extraireTMI(text) {
  const tranches = [0, 0.11, 0.3, 0.41, 0.45];
  const pourcentages = [...text.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)]
    .map((m) => toNumber(m[1]) / 100)
    .filter((v) => v != null);
  // On ne garde que ceux qui matchent une tranche, et on prend le plus élevé
  // (la TMI est la tranche marginale = la plus haute applicable).
  const candidats = pourcentages.filter((v) => tranches.some((t) => Math.abs(t - v) < 0.005));
  if (candidats.length === 0) return null;
  return Math.max(...candidats);
}

// Taux moyen : pourcentage explicitement étiqueté, sinon null.
function extraireTauxMoyen(text) {
  const m = text.match(/taux\s+moyen\s+d['e\s]*imposition[^%]{0,200}?(\d{1,2}[.,]\d{1,2})\s*%/i);
  return m ? toNumber(m[1]) / 100 : null;
}

// Nombre de parts : "Nombre de parts ... 1,5" — valeur entre 1 et 15, proche du libellé.
function extraireParts(text) {
  const m = text.match(/nombre\s+de\s+parts[^\d]{0,30}([1-9](?:[.,]\d{1,2})?)\b/i);
  if (!m) return null;
  const n = toNumber(m[1]);
  return n != null && n >= 1 && n <= 15 ? n : null;
}

// Grand nombre (revenu, RFR, impôt) : 1er nombre >= 1000 (hors année) dans la zone
// qui suit le libellé. Best-effort sur le format colonnaire ; souvent à compléter.
function extraireGrandNombre(text, labelRegex) {
  const m = text.match(labelRegex);
  if (!m) return null;
  const apres = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
  // Un nombre commence par un chiffre puis tolère espaces (insécables/fines) et points
  // de milliers. On évite ainsi de capturer les points de conduite « ...... » des avis.
  const nums = [...apres.matchAll(/\d[\d\s  .]{3,}/g)]
    .map((x) => toNumber(x[0]))
    .filter((v) => v != null && v >= 1000 && !estAnnee(v));
  return nums.length ? nums[0] : null;
}

/**
 * Parse le texte brut d'un avis d'imposition (extraction PRUDENTE).
 * @param {string} rawText texte extrait localement (pdf.js / OCR)
 * @returns {{champs:object, confiance:string, avertissements:string[]}}
 */
export function parseAvisText(rawText) {
  const text = String(rawText || '').replace(/[\r\n]+/g, ' ');

  const tmi = extraireTMI(text);
  const champs = {
    // Revenu imposable et RFR : grands nombres détachés -> extraction best-effort,
    // souvent à compléter à la main (format colonnaire).
    revenuNetImposable: extraireGrandNombre(text, /revenu\s+(?:net\s+)?imposable/i),
    revenuFiscalReference: extraireGrandNombre(text, /revenu\s+fiscal\s+de\s+r[ée]f[ée]rence/i),
    nombreParts: extraireParts(text),
    tmi,
    tauxMoyen: extraireTauxMoyen(text),
    // Plafond PER : valeur très détachée + lignes multiples (total, non utilisé…).
    // Trop ambigu pour être fiable -> on NE devine PAS, l'utilisateur le saisit.
    plafondPER: null,
    impotNet: extraireGrandNombre(text, /imp[ôo]t\s+net/i),
  };

  // Garde-fous de cohérence (valeurs aberrantes => on annule).
  const avertissements = [];
  if (champs.nombreParts != null && (champs.nombreParts < 1 || champs.nombreParts > 15)) {
    champs.nombreParts = null;
  }
  if (champs.revenuNetImposable != null && champs.revenuNetImposable < 0) {
    champs.revenuNetImposable = null;
  }

  avertissements.push(
    "Format d'avis variable : vérifie chaque valeur ci-dessous (et complète celles laissées vides) avant de valider. En cas de doute, recopie depuis ton avis.",
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
  // Cohérence avec Q3 : si l'avis montre un impôt nul, l'usager est non imposable.
  if (champs.impotNet != null) patch.estImposable = champs.impotNet > 0 ? 'OUI' : 'NON';
  return patch;
}
