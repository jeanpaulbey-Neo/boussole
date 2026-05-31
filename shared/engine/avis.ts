// Extraction des données utiles d'un avis d'imposition (SPEC §5 v2, §12).
// Miroir TypeScript de js/avis.js — réutilisable par le mobile (RN).
//
// CONFIDENTIALITÉ (SPEC §1/§10) : ne reçoit que du TEXTE déjà extrait localement
// (pdf.js / OCR). Aucun appel réseau, ne stocke rien, ne renvoie que ~5 nombres.
// Le document d'origine n'est jamais transmis. L'utilisateur valide toujours.
// Aucun paramètre fiscal codé en dur : on lit ce qui est imprimé sur l'avis.

import { AvisChamps, AvisResultat, UserProfile } from './types';

// Espaces "exotiques" fréquents dans les PDF DGFiP : insécable (U+00A0), fine (U+202F).
const NUM = '[\\d\\s\\u00A0\\u202F.,]';

function toNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw)
    .replace(/[\s  ]/g, '')
    .replace(/€/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toRate(raw: string | null | undefined): number | null {
  const n = toNumber(raw);
  if (n == null) return null;
  return n > 1 ? n / 100 : n;
}

const PATTERNS: Record<string, RegExp[]> = {
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
  plafondPER: [
    new RegExp(`plafond[^\\n]{0,40}(?:[ée]pargne\\s+retraite|d[ée]duction)[^\\d]{0,60}(${NUM}{4,})`, 'i'),
    new RegExp(`disponible[^\\n]{0,30}retraite[^\\d]{0,40}(${NUM}{4,})`, 'i'),
  ],
  impotNet: [
    new RegExp(`imp[ôo]t\\s+net[^\\d]{0,40}(${NUM}+)`, 'i'),
    new RegExp(`montant\\s+de\\s+(?:votre\\s+)?imp[ôo]t[^\\d]{0,40}(${NUM}+)`, 'i'),
  ],
};

function firstMatch(text: string, regexes: RegExp[], conv: (s: string) => number | null): number | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1] != null) {
      const v = conv(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

export function parseAvisText(rawText: string): AvisResultat {
  const text = String(rawText || '').replace(/\r/g, ' ');
  const champs: AvisChamps = {
    revenuNetImposable: firstMatch(text, PATTERNS.revenuNetImposable, toNumber),
    revenuFiscalReference: firstMatch(text, PATTERNS.revenuFiscalReference, toNumber),
    nombreParts: firstMatch(text, PATTERNS.nombreParts, toNumber),
    tmi: firstMatch(text, PATTERNS.tmi, toRate),
    tauxMoyen: firstMatch(text, PATTERNS.tauxMoyen, toRate),
    plafondPER: firstMatch(text, PATTERNS.plafondPER, toNumber),
    impotNet: firstMatch(text, PATTERNS.impotNet, toNumber),
  };

  const avertissements: string[] = [];
  if (champs.nombreParts != null && (champs.nombreParts < 1 || champs.nombreParts > 15)) {
    avertissements.push('Nombre de parts hors plage plausible — à vérifier.');
    champs.nombreParts = null;
  }
  if (champs.tmi != null && ![0, 0.11, 0.3, 0.41, 0.45].some((t) => Math.abs(t - champs.tmi!) < 0.011)) {
    avertissements.push('Le taux marginal lu ne correspond pas à une tranche connue — à vérifier.');
  }
  if (champs.revenuNetImposable != null && champs.revenuNetImposable < 0) champs.revenuNetImposable = null;

  const cles: (keyof AvisChamps)[] = ['revenuNetImposable', 'nombreParts', 'tmi'];
  const trouves = cles.filter((k) => champs[k] != null).length;
  const confiance = trouves >= 2 ? 'BONNE' : trouves === 1 ? 'PARTIELLE' : 'FAIBLE';
  if (confiance !== 'BONNE') {
    avertissements.push('Lecture incomplète : complète ou corrige les champs à la main avant de valider.');
  }
  return { champs, confiance, avertissements };
}

export function profilDepuisAvis(champs: AvisChamps): Partial<UserProfile> {
  const patch: Partial<UserProfile> = { sourceAvis: true };
  if (champs.tmi != null) patch.tmiExacte = champs.tmi;
  if (champs.revenuNetImposable != null) patch.revenuNetImposableExact = champs.revenuNetImposable;
  if (champs.nombreParts != null) patch.nombrePartsExact = champs.nombreParts;
  if (champs.plafondPER != null) patch.plafondPERExact = champs.plafondPER;
  if (champs.impotNet != null) patch.estImposable = champs.impotNet > 0 ? 'OUI' : 'NON';
  return patch;
}
