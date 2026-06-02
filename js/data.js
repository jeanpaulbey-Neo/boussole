// Chargeur de données fiscales — SPEC §3 / §13.4.
// Stratégie OTA : fetch du JSON hébergé → cache localStorage (dernière bonne valeur)
// → fallback bundlé (embarqué) en dernier recours. Le service worker précache aussi
// /shared/data/*.json pour l'offline-first du socle déjà chargé.
// Le loader tolère les clés inconnues et logue une alerte si une clé attendue manque (§13.4).

const BASE = '/shared/data';
const CACHE_KEY = 'boussole.dataCache.v1';

// Fallback bundlé minimal — garantit que l'app ne plante jamais au tout premier
// lancement hors-ligne. La source de vérité reste /shared/data/*.json.
const FALLBACK = {
  fiscalParams: {
    version: '2026.1-bundled', date_maj: '2026-05-30',
    cadre_legal: 'LOI n° 2026-103 du 19 février 2026 de finances pour 2026',
    annee_revenus: 2025, annee_declaration: 2026,
    bareme_ir: { statut: 'CONFIRME', source: 'service-public.fr / DGFiP', reference: 'art. 4 LF 2026',
      tranches: [{ plafond: 11600, taux: 0 }, { plafond: 29579, taux: 0.11 }, { plafond: 84577, taux: 0.3 }, { plafond: 181917, taux: 0.41 }, { plafond: null, taux: 0.45 }],
      abattement_10pct_min: 509, abattement_10pct_max: 14555 },
    credit_emploi_domicile: { statut: 'A_SURVEILLER', source: 'service-public.fr / Urssaf Cesu', reference: 'art. 199 sexdecies CGI', taux: 0.5, est_credit_remboursable: true, plafond_depense_base: 12000, majoration_par_enfant: 1500, majoration_par_membre_65plus: 1500, majorations_cumul_max: 3000, plafond_depense_majore_max: 15000, plafond_premiere_annee: 15000, plafond_handicap_lourd: 20000 },
    frais_reels: { statut: 'CONFIRME', source: 'impots.gouv.fr', abattement_forfaitaire_taux: 0.1, abattement_min: 509, abattement_max: 14555, forfait_teletravail_jour: 2.7 },
    dons: { statut: 'CONFIRME', source: 'service-public.fr / LégiFiscal', reference: 'art. 200 CGI ; art. 28 LF 2026', taux_interet_general: 0.66, plafond_interet_general_pct_revenu: 0.2, taux_aide_personnes_difficulte: 0.75, plafond_aide_difficulte_montant: 2000 },
    epargne_salariale: { statut: 'CONFIRME', source: 'service-public.fr / BOSS', pass: 48060, abondement_pee_plafond_pct_pass: 0.08, abondement_pee_multiple_max_versement: 3, interessement_plafond_pct_pass: 0.75, blocage_pee_annees: 5, interessement_participation_exonere_ir_si_verse_pee: true },
    per: { statut: 'STABLE', source: 'service-public.fr', deductible: true, bloque_jusqu_retraite: true },
    assurance_vie: { statut: 'STABLE', source: 'service-public.fr', seuil_anciennete_annees: 8, abattement_annuel_solo: 4600, abattement_annuel_couple: 9200 },
    pea: { statut: 'STABLE', source: 'service-public.fr', seuil_exoneration_ir_annees: 5, ps_toujours_dus: true },
    plafonnement_niches_fiscales: { statut: 'STABLE', source: 'impots.gouv.fr', montant: 10000 },
  },
  veille: { date_maj: '2026-05-30', plf_en_cours: false, surveillances: [] },
  modules: { version: '2026.1-bundled', modules: [] },
};

const EXPECTED_KEYS = ['bareme_ir', 'credit_emploi_domicile', 'frais_reels', 'dons', 'epargne_salariale', 'per', 'assurance_vie', 'pea'];

function verifierIntegrite(fp) {
  EXPECTED_KEYS.forEach((k) => {
    if (!(k in fp)) console.warn(`[data] clé fiscale attendue manquante : ${k} — vérifier fiscal-params.json`);
  });
}

async function fetchJson(name) {
  const res = await fetch(`${BASE}/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${name}`);
  return res.json();
}

// Niches : optionnel, ne doit jamais faire échouer le chargement.
// Retourne { niches, categories } pour permettre le regroupement à l'écran.
async function fetchNichesSafe() {
  try {
    const d = await fetchJson('niches-fiscales');
    return { niches: d.niches || [], categories: d.categories || [] };
  } catch (_) {
    return { niches: [], categories: [] };
  }
}

// Droits sociaux : optionnel également. Retourne { aides, categories, simulateur }.
async function fetchDroitsSafe() {
  try {
    const d = await fetchJson('droits-sociaux');
    return { aides: d.aides || [], categories: d.categories || [], simulateur: d.simulateur_officiel || '' };
  } catch (_) {
    return { aides: [], categories: [], simulateur: '' };
  }
}

// Cases de déclaration : optionnel. Retourne { cases, version }.
async function fetchCasesSafe() {
  try {
    const d = await fetchJson('cases-declaration');
    return { cases: d.cases || {}, version: d.version || '' };
  } catch (_) {
    return { cases: {}, version: '' };
  }
}

// Parcours événements de vie : optionnel. Retourne { evenements, version }.
async function fetchEvenementsSafe() {
  try {
    const d = await fetchJson('evenements-vie');
    return { evenements: d.evenements || [], version: d.version || '' };
  } catch (_) {
    return { evenements: [], version: '' };
  }
}

// Registre des sources officielles (URLs cliquables) : optionnel. Retourne un tableau
// [{ label, url, alias }]. Sert à rendre les références cliquables côté UI.
async function fetchSourcesSafe() {
  try {
    const d = await fetchJson('sources');
    return Array.isArray(d.sources) ? d.sources : [];
  } catch (_) {
    return [];
  }
}

export async function loadData() {
  try {
    const [fiscalParams, veille, modulesDoc, nichesDoc, droitsDoc, casesDoc, eventsDoc, sourcesIndex] = await Promise.all([
      fetchJson('fiscal-params'),
      fetchJson('veille-fiscale'),
      fetchJson('modules'),
      fetchNichesSafe(),
      fetchDroitsSafe(),
      fetchCasesSafe(),
      fetchEvenementsSafe(),
      fetchSourcesSafe(),
    ]);
    verifierIntegrite(fiscalParams);
    const data = {
      fiscalParams, veille, modules: modulesDoc.modules || [],
      niches: nichesDoc.niches, nichesCategories: nichesDoc.categories,
      droits: droitsDoc.aides, droitsCategories: droitsDoc.categories, droitsSimulateur: droitsDoc.simulateur,
      casesDeclaration: casesDoc.cases, casesVersion: casesDoc.version,
      evenements: eventsDoc.evenements, evenementsVersion: eventsDoc.version,
      sourcesIndex,
      source: 'reseau',
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fiscalParams, veille, modulesDoc, nichesDoc, droitsDoc, casesDoc, eventsDoc, sourcesIndex }));
    return data;
  } catch (e) {
    console.warn('[data] fetch réseau échoué, tentative cache local :', e.message);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { fiscalParams, veille, modulesDoc, nichesDoc, droitsDoc, casesDoc, eventsDoc, sourcesIndex } = JSON.parse(cached);
        verifierIntegrite(fiscalParams);
        return {
          fiscalParams, veille, modules: modulesDoc.modules || [],
          niches: (nichesDoc && nichesDoc.niches) || [], nichesCategories: (nichesDoc && nichesDoc.categories) || [],
          droits: (droitsDoc && droitsDoc.aides) || [], droitsCategories: (droitsDoc && droitsDoc.categories) || [],
          droitsSimulateur: (droitsDoc && droitsDoc.simulateur) || '',
          casesDeclaration: (casesDoc && casesDoc.cases) || {}, casesVersion: (casesDoc && casesDoc.version) || '',
          evenements: (eventsDoc && eventsDoc.evenements) || [], evenementsVersion: (eventsDoc && eventsDoc.version) || '',
          sourcesIndex: sourcesIndex || [],
          source: 'cache',
        };
      } catch (_) { /* tombe sur le fallback */ }
    }
    console.warn('[data] aucun cache, utilisation du fallback bundlé');
    return { fiscalParams: FALLBACK.fiscalParams, veille: FALLBACK.veille, modules: FALLBACK.modules, niches: [], nichesCategories: [], droits: [], droitsCategories: [], droitsSimulateur: '', casesDeclaration: {}, casesVersion: '', evenements: [], evenementsVersion: '', sourcesIndex: [], source: 'fallback' };
  }
}
