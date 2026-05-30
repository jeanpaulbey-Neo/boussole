// Proxy Vercel serverless — « Approfondir » (SPEC §3, §7.2).
// La clé Anthropic ne transite JAMAIS par le client : elle vit ici, côté serveur.
// Le contexte est borné aux paramètres fournis (anti-hallucination).
import { buildSystemPrompt } from './_lib/systemPrompt.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(503).json({
      error: 'proxy_non_configure',
      reponse:
        "L'approfondissement à la demande n'est pas activé (clé API absente côté serveur). Le module reste complet et fiable hors-ligne.",
    });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { question, fiscalParams } = body;
    if (!question) {
      res.status(400).json({ error: 'question manquante' });
      return;
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: buildSystemPrompt(fiscalParams),
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!anthropicRes.ok) {
      const txt = await anthropicRes.text();
      res.status(502).json({ error: 'anthropic_error', detail: txt.slice(0, 300) });
      return;
    }
    const data = await anthropicRes.json();
    const reponse = (data.content || []).map((b) => b.text || '').join('\n').trim();
    res.status(200).json({ reponse, sources: ['impots.gouv.fr', 'service-public.fr'] });
  } catch (e) {
    res.status(500).json({ error: 'exception', detail: String(e).slice(0, 300) });
  }
}
