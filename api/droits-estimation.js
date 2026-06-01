// Proxy Vercel serverless — chiffrage OPTIONNEL des droits sociaux via OpenFisca.
// ⚠️ C'est le SEUL traitement de Boussole qui envoie des données hors de l'appareil.
// Il n'est appelé qu'après consentement explicite de l'utilisateur (opt-in).
//
// OpenFisca-France est le moteur socio-fiscal libre de l'État (api.fr.openfisca.org).
// Subtilité validée : le RSA et la prime d'activité (ppa) se calculent sur les
// RESSOURCES DU TRIMESTRE DE RÉFÉRENCE — on renseigne donc le revenu net sur le mois
// courant + les 3 mois précédents, sinon les montants sont faux.
//
// Aucune donnée nominative n'est demandée ni transmise (pas de nom, NIR, adresse
// précise) : seulement revenu net, composition du foyer, loyer et, optionnellement,
// le code postal pour la zone APL. Rien n'est journalisé côté Boussole.

const OPENFISCA = 'https://api.fr.openfisca.org/latest/calculate';

// Mois courant + 3 mois précédents, au format AAAA-MM.
function moisReference(d = new Date()) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out; // [courant, M-1, M-2, M-3]
}

function construireSituation(input) {
  const mois = moisReference();
  const moisCourant = mois[0];
  const net = Math.max(0, Number(input.revenuNetMensuel) || 0);
  const couple = input.situation === 'COUPLE';
  const nbEnfants = Math.min(8, Math.max(0, Number(input.nbEnfants) || 0));
  const loyer = Math.max(0, Number(input.loyer) || 0);

  // Le revenu net du foyer : réparti entre les adultes (la prime d'activité est
  // individualisée — une répartition même approximative vaut mieux que tout sur un seul).
  const nbAdultes = couple ? 2 : 1;
  const netParAdulte = net / nbAdultes;
  const salaireMensuel = {};
  mois.forEach((m) => { salaireMensuel[m] = Math.round(netParAdulte); });

  const individus = {
    demandeur: { salaire_net: { ...salaireMensuel }, date_naissance: { ETERNITY: '1985-01-01' } },
  };
  const parents = ['demandeur'];
  if (couple) {
    individus.conjoint = { salaire_net: { ...salaireMensuel }, date_naissance: { ETERNITY: '1985-01-01' } };
    parents.push('conjoint');
  }
  const enfants = [];
  for (let i = 0; i < nbEnfants; i++) {
    const id = `enfant_${i}`;
    individus[id] = { date_naissance: { ETERNITY: '2016-01-01' } }; // ~8-9 ans (défaut)
    enfants.push(id);
  }

  const menage = {
    personne_de_reference: ['demandeur'],
    conjoint: couple ? ['conjoint'] : [],
    enfants,
    loyer: { [moisCourant]: loyer },
    statut_occupation_logement: { [moisCourant]: 'locataire_vide' },
  };
  if (/^\d{5}$/.test(String(input.depcom || ''))) {
    menage.depcom = { [moisCourant]: String(input.depcom) };
  }

  return {
    situation: {
      individus,
      familles: {
        fam: { parents, enfants, rsa: { [moisCourant]: null }, ppa: { [moisCourant]: null }, aide_logement: { [moisCourant]: null } },
      },
      foyers_fiscaux: { ff: { declarants: parents, personnes_a_charge: enfants } },
      menages: { men: menage },
    },
    moisCourant,
  };
}

// Code postal -> code commune INSEE (depcom), via l'API Géo officielle.
// Un code postal peut couvrir plusieurs communes : on prend la première (la zone
// APL est en pratique identique). Best-effort : toute erreur renvoie null (on calcule
// alors sans zone, légèrement moins précis pour l'aide au logement).
async function codePostalVersInsee(codePostal) {
  if (!/^\d{5}$/.test(String(codePostal || ''))) return null;
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=code&format=json`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    return Array.isArray(arr) && arr[0] && arr[0].code ? arr[0].code : null;
  } catch (_) {
    return null;
  }
}

async function appelerOpenFisca(situation) {
  const res = await fetch(OPENFISCA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(situation),
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`openfisca ${res.status}`);
    err.detail = txt.slice(0, 300);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    // Le client envoie un code postal (optionnel) ; on le convertit en code commune INSEE.
    const depcom = await codePostalVersInsee(body.codePostal);
    const { situation: sit, moisCourant } = construireSituation({ ...body, depcom });

    let data;
    try {
      data = await appelerOpenFisca(sit);
    } catch (e) {
      // La zone (depcom) est la cause la plus fréquente de rejet : on retente sans.
      if (e.status === 400 && sit.menages.men.depcom) {
        delete sit.menages.men.depcom;
        data = await appelerOpenFisca(sit);
      } else {
        throw e;
      }
    }

    const fam = (data.familles && data.familles.fam) || {};
    const val = (v) => (v && typeof v[moisCourant] === 'number' ? Math.round(v[moisCourant]) : null);
    res.status(200).json({
      moisCourant,
      estimations: {
        rsa: val(fam.rsa),
        prime_activite: val(fam.ppa),
        aide_logement: val(fam.aide_logement),
      },
      moteur: 'OpenFisca-France (api.fr.openfisca.org)',
      avertissement:
        "Estimation indicative produite par le moteur public OpenFisca à partir des éléments saisis. Le simulateur officiel mesdroitssociaux.gouv.fr et les organismes (CAF, CPAM…) restent seuls décisionnaires.",
    });
  } catch (e) {
    res.status(502).json({
      error: 'estimation_indisponible',
      detail: String(e && e.detail ? e.detail : e).slice(0, 300),
      message:
        "Le moteur d'estimation est momentanément indisponible. Le panorama ci-dessus reste valable : utilise le simulateur officiel pour le chiffrage.",
    });
  }
}
