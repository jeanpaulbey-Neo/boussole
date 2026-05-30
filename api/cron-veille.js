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
          "Tu es un assistant de veille fiscale. À partir des extraits de pages officielles fournis, résume UNIQUEMENT ce qui change pour les paramètres suivants : barème IR, PASS, crédit emploi à domicile, dons. Pour chaque changement : valeur avant/après, source, date d'effet. N'invente AUCUN chiffre ; si tu ne trouves pas, dis-le. Ne décide rien : tu signales, l'humain valide.",
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
    '## Prochaine action',
    '1. Vérifier chaque valeur signalée sur source de niveau 1–3 (Légifrance / BOFiP / service-public).',
    '2. Éditer fiscal-params.json + bump version + date_maj (Procédure A du RUNBOOK).',
    '3. Commit avec source citée + push.',
  ].join('\n');

  await notifierAdmin(rapport);
  res.status(200).json({ ok: true, date, sources: snapshots.map((s) => ({ id: s.id, ok: s.ok, hash: s.hash })), rapport });
}
