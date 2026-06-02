// Cron de veille fiscale (SPEC §13.3). L'automatisation DÉTECTE et ALERTE ;
// l'humain VALIDE et PUBLIE (cf. RUNBOOK). Aucune auto-publication d'un chiffre.
//
// Flux :
//   1) FETCH des pages sources surveillées (hiérarchie de confiance §13.2)
//   2) DIFF vs snapshot précédent (hash du contenu) — le stockage du snapshot doit être
//      branché sur Vercel KV/Blob (TODO marqué) ; ici on calcule le hash courant.
//   3) Si changement OU page d'actualité : appel Claude (bornage anti-invention)
//      pour résumer ce qui change (valeur avant/après, source, date d'effet).
//   4) PRODUIT un rapport de veille (Markdown) → notification admin (webhook/email).
//
// Déclenché par Vercel Cron (voir vercel.json). Mensuel en temps normal, à intensifier
// manuellement en saison PLF (sept.→fév.).
import { createHash } from 'node:crypto';

const SOURCES = [
  { id: 'bareme_ir', niveau: 3, url: 'https://www.service-public.fr/particuliers/vosdroits/F1419', params: ['bareme_ir'] },
  { id: 'pass', niveau: 3, url: 'https://www.service-public.fr/particuliers/vosdroits/F15386', params: ['epargne_salariale'] },
  { id: 'credit_domicile', niveau: 3, url: 'https://www.service-public.fr/particuliers/vosdroits/F12', params: ['credit_emploi_domicile'] },
  { id: 'dons', niveau: 3, url: 'https://www.service-public.fr/particuliers/vosdroits/F426', params: ['dons'] },
  { id: 'cases_2042', niveau: 3, url: 'https://www.impots.gouv.fr/particulier/je-declare-mes-revenus', params: ['*cases_declaration*'] },
  { id: 'plf', niveau: 6, url: 'https://www.assemblee-nationale.fr/dyn/budget', params: ['*veille*'] },
];

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

function hash(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function fetchSnapshot(src) {
  try {
    const r = await fetch(src.url, { headers: { 'user-agent': 'boussole-veille/1.0' } });
    const txt = await r.text();
    // On ne garde qu'un extrait pertinent (les pages sont volumineuses) pour le hash + le résumé.
    const extrait = txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
    return { id: src.id, ok: r.ok, status: r.status, hash: hash(extrait), extrait };
  } catch (e) {
    return { id: src.id, ok: false, error: String(e).slice(0, 200), hash: null };
  }
}

async function resumeViaClaude(snapshots) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return '_(Résumé Claude non généré : ANTHROPIC_API_KEY absente.)_';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system:
          "Tu es un assistant de veille fiscale. À partir des extraits de pages officielles fournis, résume UNIQUEMENT ce qui change pour les paramètres suivants : barème IR, PASS, crédit emploi à domicile, dons, et tout changement visible des numéros de cases de la déclaration 2042. Pour chaque changement : valeur avant/après, source, date d'effet. N'invente AUCUN chiffre ni numéro de case ; si tu ne trouves pas, dis-le. Ne décide rien : tu signales, l'humain valide.",
        messages: [{ role: 'user', content: 'Extraits:\n' + snapshots.map((s) => `### ${s.id}\n${s.extrait || s.error}`).join('\n\n') }],
      }),
    });
    if (!r.ok) return `_(Erreur Claude ${r.status}.)_`;
    const d = await r.json();
    return (d.content || []).map((b) => b.text || '').join('\n').trim();
  } catch (e) {
    return `_(Exception Claude : ${String(e).slice(0, 150)}.)_`;
  }
}

// Garde-fou « cases de déclaration » : les numéros de cases 2042 (cases-declaration.json)
// valent pour une campagne donnée et la DGFiP les renumérote parfois. On NE devine jamais
// un nouveau numéro : on pose un rappel daté pour qu'un humain recontrôle au bon moment.
// La campagne de déclaration s'ouvre vers avril (revenus de l'année précédente).
function rappelCases(d = new Date()) {
  const mois = d.getUTCMonth() + 1;
  const annee = d.getUTCFullYear();
  const fenetreVigilance = mois >= 2 && mois <= 6; // févr.→juin : pré-campagne + campagne
  const prochaineCampagne = mois > 6 ? annee + 1 : annee;
  return [
    '## Cases de déclaration (2042) — garde-fou annuel',
    '- Catalogue : `shared/data/cases-declaration.json` (numéros indicatifs, marqués « à vérifier » dans l\'app).',
    fenetreVigilance
      ? `- ⚠️ **Campagne ${annee} ouverte/proche** : RECONTRÔLER chaque numéro de case 2042 sur impots.gouv.fr (brochure 2042 RICI / notice). En cas de changement : éditer cases-declaration.json + bump version + date_maj.`
      : `- ✅ Hors campagne : prochain contrôle à prévoir vers mars-avril ${prochaineCampagne}.`,
    '- Rappel : ne jamais inventer un numéro ; à défaut de certitude, laisser le renvoi « formulaire + notice ».',
  ].join('\n');
}

// Vérification anti-lien cassé : on charge le registre sources.json déployé et on teste
// que chaque URL officielle répond (GET, redirections suivies). Les liens en échec sont
// signalés pour correction humaine (éditer sources.json + bump version). L'automatisation
// DÉTECTE ; l'humain CORRIGE (cf. RUNBOOK).
async function verifierLiens(base) {
  let liste = [];
  try {
    const r = await fetch(`${base}/shared/data/sources.json`, { headers: { 'user-agent': 'boussole-veille/1.0' } });
    if (r.ok) { const d = await r.json(); liste = Array.isArray(d.sources) ? d.sources : []; }
  } catch (_) { /* registre indisponible ce run */ }
  if (!liste.length) {
    return '## Liens des sources (anti-lien cassé)\n- _(sources.json introuvable — vérification ignorée ce run.)_';
  }
  // User-agent navigateur : beaucoup de sites officiels (Légifrance, ameli, urssaf…)
  // renvoient 403/503 aux robots tout en étant parfaitement accessibles à un humain.
  const UA = 'Mozilla/5.0 (compatible; BoussoleVeille/1.0; +https://boussole.app)';
  const res = await Promise.all(liste.map(async (s) => {
    try {
      const rr = await fetch(s.url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } });
      return { label: s.label, url: s.url, status: rr.status };
    } catch (e) {
      return { label: s.label, url: s.url, status: 'ERR', err: String(e).slice(0, 80) };
    }
  }));
  // « Cassé » = page introuvable (404/410) : seul cas qui exige de corriger l'URL.
  // Les 401/403/405/429/5xx sont des blocages anti-robot/WAF (l'URL existe) → « à vérifier »
  // sans fausse alarme ; une erreur réseau est aussi mise en « à vérifier » (souvent transitoire).
  const casses = res.filter((x) => x.status === 404 || x.status === 410);
  const aVerifier = res.filter((x) => x.status === 'ERR' || (typeof x.status === 'number' && x.status >= 400 && x.status !== 404 && x.status !== 410));
  return [
    '## Liens des sources (anti-lien cassé)',
    `- ${res.length} liens testés — ${casses.length} cassé(s) (404/410), ${aVerifier.length} à vérifier (blocage robots/réseau).`,
    ...casses.map((x) => `- ❌ **CASSÉ** ${x.label} → ${x.url} (HTTP ${x.status}) — corriger \`shared/data/sources.json\` puis bump version.`),
    ...aVerifier.map((x) => `- ⚠️ ${x.label} → ${x.url} (${x.status}) — bloque les robots ; vérifier à la main au besoin.`),
    (casses.length === 0 && aVerifier.length === 0) ? '- ✅ Tous les liens répondent normalement.' : '',
  ].filter(Boolean).join('\n');
}

async function notifierAdmin(rapport) {
  const hook = process.env.VEILLE_WEBHOOK_URL;
  if (!hook) {
    console.log('[veille] (pas de VEILLE_WEBHOOK_URL) rapport:\n' + rapport);
    return;
  }
  try {
    await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: rapport }) });
  } catch (e) {
    console.error('[veille] notification échouée', e);
  }
}

export default async function handler(req, res) {
  const snapshots = await Promise.all(SOURCES.map(fetchSnapshot));
  // TODO branchement stockage : comparer snapshots[].hash au snapshot précédent (Vercel KV/Blob)
  //      pour ne déclencher le résumé Claude que sur diff réel. Sans stockage, on résume à chaque run.
  const resume = await resumeViaClaude(snapshots);
  // Base URL du déploiement (pour relire le registre de sources et tester les liens).
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const liens = host ? await verifierLiens(`${proto}://${host}`) : '## Liens des sources (anti-lien cassé)\n- _(host inconnu — vérification ignorée ce run.)_';
  const date = new Date().toISOString().slice(0, 10);
  const rapport = [
    `# Rapport de veille fiscale — ${date}`,
    '',
    '> L\'automatisation détecte ; l\'humain valide et publie (cf. RUNBOOK_validation_fiscale.md).',
    '',
    '## Sources interrogées',
    ...snapshots.map((s) => `- **${s.id}** : ${s.ok ? `OK (hash ${s.hash})` : `ÉCHEC (${s.error || s.status})`}`),
    '',
    '## Synthèse (à VÉRIFIER sur source officielle avant toute publication)',
    resume,
    '',
    rappelCases(),
    '',
    liens,
    '',
    '## Prochaine action',
    '1. Vérifier chaque valeur signalée sur source de niveau 1–3 (Légifrance / BOFiP / service-public).',
    '2. Éditer fiscal-params.json + bump version + date_maj (Procédure A du RUNBOOK).',
    '3. En période de campagne : recontrôler aussi cases-declaration.json (numéros 2042).',
    '4. Commit avec source citée + push.',
  ].join('\n');

  await notifierAdmin(rapport);
  res.status(200).json({ ok: true, date, sources: snapshots.map((s) => ({ id: s.id, ok: s.ok, hash: s.hash })), rapport });
}
