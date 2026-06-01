// Boussole — app PWA d'éducation & d'orientation à l'optimisation financière.
// SPEC : profilage (§5) → moteur d'orientation (§6) → micro-learning (§7).
import { loadData } from './data.js';
import { orienter, estimeTMI, badgeFraicheur, CATALOGUE, adequationNiches, adequationDroits, calcIR } from './engine.js';
import { parseAvisText, profilDepuisAvis } from './avis.js';

const BANDEAU_LEGAL =
  "Informations pédagogiques fondées sur les règles fiscales en vigueur. Ce n'est pas un conseil personnalisé. Vérifie ta situation sur impots.gouv.fr ou auprès d'un professionnel.";

const TAGS = {
  GRATUIT: { emoji: '🟢', label: 'Gratuit' },
  REORIENTATION: { emoji: '🔵', label: 'Réorientation' },
  DEPENSE: { emoji: '🟠', label: 'Dépense' },
};

// ── Profilage : 15 questions (§5) ──
const QUESTIONS = [
  { field: 'situationFamiliale', q: 'Situation familiale ?', opts: [['CELIBATAIRE', 'Célibataire'], ['COUPLE', 'En couple'], ['PARENT_ISOLE', 'Parent isolé']] },
  { field: 'nbCharges', q: 'Enfants ou personnes à charge ?', opts: [[0, '0'], [1, '1'], [2, '2'], [3, '3 +']] },
  { field: 'estImposable', q: "Payez-vous de l'impôt sur le revenu ?", opts: [['OUI', 'Oui'], ['NON', 'Non'], ['INCONNU', 'Je ne sais pas']] },
  { field: 'revenuMensuelFoyer', q: 'Revenu net mensuel du foyer ?', opts: [['<1500', 'Moins de 1 500 €'], ['1500-2500', '1 500 – 2 500 €'], ['2500-4000', '2 500 – 4 000 €'], ['4000-6000', '4 000 – 6 000 €'], ['>6000', 'Plus de 6 000 €']] },
  { field: 'statut', q: 'Statut professionnel ?', opts: [['SALARIE', 'Salarié'], ['INDEPENDANT', 'Indépendant'], ['FONCTIONNAIRE', 'Fonctionnaire'], ['RETRAITE', 'Retraité'], ['SANS_EMPLOI', 'Sans emploi']] },
  { field: 'emploiDomicile', q: 'Employez-vous (ou pourriez) quelqu\'un à domicile ?', opts: [['OUI', 'Oui'], ['NON', 'Non'], ['POSSIBLE', 'Pas encore mais possible']] },
  { field: 'dons', q: 'Faites-vous des dons ?', opts: [['REGULIER', 'Régulièrement'], ['OCCASIONNEL', 'Occasionnellement'], ['NON', 'Non']] },
  { field: 'epargneSalariale', q: 'Épargne salariale proposée (PEE, intéressement) ?', opts: [['OUI', 'Oui'], ['NON', 'Non'], ['INCONNU', 'Je ne sais pas']] },
  { field: 'epargnePrecaution', q: 'Épargne de précaution (~3 mois de dépenses) ?', opts: [['OUI', 'Oui'], ['PARTIEL', 'Partiellement'], ['NON', 'Non']] },
  { field: 'capaciteEpargne', q: "Capacité d'épargne mensuelle ?", opts: [['AUCUNE', 'Aucune'], ['<100', 'Moins de 100 €'], ['100-300', '100 – 300 €'], ['>300', 'Plus de 300 €']] },
  { field: 'logement', q: 'Logement ?', opts: [['LOCATAIRE', 'Locataire'], ['PROPRIO_RP', 'Propriétaire (résidence principale)'], ['PROPRIO_BAILLEUR', 'Propriétaire bailleur']] },
  { field: 'fraisProEleves', q: 'Trajets longs / frais pro élevés ?', opts: [['OUI', 'Oui'], ['NON', 'Non']] },
  { field: 'creditsEnCours', q: 'Crédits en cours ?', opts: [['OUI', 'Oui'], ['NON', 'Non']] },
  { field: 'objectif', q: 'Objectif prioritaire ?', opts: [['SECURISER', 'Sécuriser'], ['PROJET', 'Projet 5–10 ans'], ['RETRAITE', 'Retraite'], ['IMPOTS', "Réduire l'impôt"]] },
  { field: 'situationParticuliere', q: 'Situation particulière en vue ?', opts: [['SUCCESSION', 'Succession'], ['EXPATRIATION', 'Expatriation'], ['CREATION_ENTREPRISE', "Création d'entreprise"], ['GROS_PATRIMOINE', 'Gros patrimoine'], ['AUCUNE', 'Aucune']] },
];

// ── État global + persistance ──
const store = {
  route: 'onboarding',
  data: null,
  profile: null,
  draft: {},
  step: 0,
  premium: false,
  progression: {},
  currentLeverId: null,
  currentModuleId: null,
  avis: null,
};

const K = { profile: 'boussole.profile', prog: 'boussole.progression', prem: 'boussole.premium' };
const save = () => {
  if (store.profile) localStorage.setItem(K.profile, JSON.stringify(store.profile));
  localStorage.setItem(K.prog, JSON.stringify(store.progression));
  localStorage.setItem(K.prem, JSON.stringify(store.premium));
};
const restore = () => {
  try { store.profile = JSON.parse(localStorage.getItem(K.profile)) || null; } catch (_) {}
  try { store.progression = JSON.parse(localStorage.getItem(K.prog)) || {}; } catch (_) {}
  try { store.premium = JSON.parse(localStorage.getItem(K.prem)) || false; } catch (_) {}
};

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = (route, extra = {}) => { Object.assign(store, extra); store.route = route; render(); window.scrollTo(0, 0); };

// ── Composants réutilisables ──
function bandeauLegal() {
  return `<p class="legal">⚖️ ${BANDEAU_LEGAL}</p>`;
}
function badge() {
  const { texte, alerte } = badgeFraicheur(store.data.fiscalParams, store.data.veille);
  return `<div class="freshness">📅 ${esc(texte)} · v${esc(store.data.fiscalParams.version)}${alerte ? `<span class="freshness-alert">⚠️ ${esc(alerte)}</span>` : ''}</div>`;
}
function tag(c) { return `<span class="tag tag-${c}">${TAGS[c].emoji} ${TAGS[c].label}</span>`; }
function header(title, back) {
  return `<header class="topbar">${back ? `<button class="icon-btn" data-go="${back}">←</button>` : '<span class="icon-btn"></span>'}<h1>${esc(title)}</h1><button class="icon-btn" data-go="settings">⚙️</button></header>`;
}
function tabbar() {
  const tabs = [['bilan', '🎯', 'Bilan'], ['library', '📚', 'Apprendre'], ['checklist', '✓', 'Actions'], ['settings', '⚙️', 'Réglages']];
  return `<nav class="tabbar">${tabs.map(([r, e, l]) => `<button class="tab ${store.route === r ? 'active' : ''}" data-go="${r}">${e}<span>${l}</span></button>`).join('')}</nav>`;
}

// ── Écrans ──
function screenOnboarding() {
  const refaire = store.profile ? `<button class="btn-ghost" data-go="bilan">Revoir mon bilan</button>` : '';
  return `<div class="screen onboarding">
    <div class="hero">
      <div class="compass">🧭</div>
      <h1>Boussole</h1>
      <p class="tagline">Réduis tes impôts <strong>sans dépenser un euro de plus</strong>.</p>
      <p class="sub">Un bilan d'orientation fiscale &amp; budgétaire en 15 questions. On t'explique ce qui te revient déjà — on ne te vend rien.</p>
    </div>
    <div class="onboarding-actions">
      <button class="btn-primary" data-action="start">Commencer mon bilan</button>
      ${refaire}
    </div>
    ${bandeauLegal()}
  </div>`;
}

function screenProfiling() {
  const i = store.step;
  const Q = QUESTIONS[i];
  const cur = store.draft[Q.field];
  const progress = Math.round((i / QUESTIONS.length) * 100);
  return `<div class="screen profiling">
    <div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div>
    <div class="profiling-head">
      <span class="step-count">Question ${i + 1} / ${QUESTIONS.length}</span>
      <h2>${esc(Q.q)}</h2>
    </div>
    <div class="options">
      ${Q.opts.map(([v, l]) => `<button class="option ${cur === v ? 'selected' : ''}" data-pick="${esc(String(v))}">${esc(l)}</button>`).join('')}
    </div>
    <div class="profiling-nav">
      <button class="btn-ghost" data-action="prev" ${i === 0 ? 'disabled' : ''}>← Retour</button>
    </div>
  </div>`;
}

function leverCard(item, masque) {
  const { lever, result, surveillance } = item;
  const veilleChip = surveillance
    ? `<span class="veille-chip" title="${esc(surveillance.nature_risque)}">⚠️ Règle susceptible d'évoluer (${esc(surveillance.horizon)})</span>` : '';
  let gain = '';
  if (masque) {
    gain = `<div class="gain locked" data-go="paywall">🔒 Gain estimé — Premium</div>`;
  } else if (result.gainEstimeEuros !== null) {
    gain = `<div class="gain">≈ ${Math.round(result.gainEstimeEuros).toLocaleString('fr-FR')} € <span class="gain-note">/ an (estimation)</span></div>`;
  } else {
    gain = `<div class="gain gain-na">Gain à estimer selon ta situation</div>`;
  }
  return `<article class="lever-card" data-lever="${lever.id}">
    <div class="lever-top">${tag(result.coutNet)}${veilleChip}</div>
    <h3>${esc(lever.titre)}</h3>
    <p class="lever-calc">${esc(result.texteCalcul)}</p>
    ${result.avertissement ? `<p class="warn">⚠️ ${esc(result.avertissement)}</p>` : ''}
    ${gain}
    <div class="lever-actions">
      <button class="btn-small" data-module="${lever.moduleId}">Apprendre (60 s)</button>
      <button class="btn-small btn-small-ghost" data-lever-detail="${lever.id}">Où agir</button>
    </div>
  </article>`;
}

function screenBilan() {
  if (!store.profile) return screenOnboarding();
  const out = orienter(store.profile, store.data.fiscalParams, store.data.veille);
  const tmi = estimeTMI(store.profile);
  let body = '';

  body += `<div class="filter-row">
    <label class="switch"><input type="checkbox" id="zeroDep" ${store.profile.filtreZeroDepense ? 'checked' : ''}><span class="slider"></span></label>
    <div><strong>Filtre « Zéro dépense supplémentaire »</strong><br><small>${store.profile.filtreZeroDepense ? 'Actif : seuls les leviers 🟢 et 🔵.' : 'Inactif : les leviers 🟠 (dépense) sont aussi affichés.'}</small></div>
  </div>`;

  const tmiSource = store.profile.sourceAvis && typeof store.profile.tmiExacte === 'number'
    ? `<span class="tmi-exact">✓ d'après ton avis d'impôt</span>`
    : `<span class="tmi-est">estimée — <button class="lien-inline" data-go="avis-import">affiner avec mon avis</button></span>`;
  body += `<p class="tmi-line">Tranche marginale : <strong>${Math.round(tmi * 100)} %</strong> ${tmiSource}</p>`;

  if (out.encartPro) {
    body += `<div class="encart-pro">🧑‍⚖️ <strong>Situation particulière détectée.</strong> Pour ${esc(libelleSituation(store.profile.situationParticuliere))}, consulte un professionnel (notaire / CGP / expert-comptable). On ne simule pas ce cas.</div>`;
  }
  out.bannieres.forEach((b) => { body += `<div class="banniere">💡 ${esc(b)}</div>`; });

  if (out.leviers.length === 0) {
    body += `<p class="empty">Aucun levier « zéro dépense » ne ressort nettement pour ce profil. Désactive le filtre pour voir les options de dépense défiscalisée, ou explore la bibliothèque.</p>`;
  } else {
    const cards = out.leviers.map((item, idx) => {
      const masque = !store.premium && idx >= 3; // gratuit : top 3 chiffrés (§9)
      return leverCard(item, masque);
    }).join('');
    body += `<div class="lever-list">${cards}</div>`;
    if (!store.premium && out.leviers.length > 3) {
      body += `<button class="btn-primary" data-go="paywall">Débloquer tous les leviers chiffrés</button>`;
    }
  }

  body += `<button class="btn-ghost" data-go="niches">🗂️ Voir toutes les niches fiscales & leur adéquation</button>`;
  body += `<button class="btn-ghost" data-go="droits">🤝 Explorer mes droits sociaux (CAF, aides…)</button>`;
  body += `<button class="btn-ghost" data-go="chiffrage">💶 Chiffrer mes économies en euros réels</button>`;

  return `<div class="screen">${header('Ton bilan d\'orientation')}
    <div class="scroll">
      ${badge()}
      ${body}
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

function libelleSituation(s) {
  return { SUCCESSION: 'une succession', EXPATRIATION: 'une expatriation', CREATION_ENTREPRISE: "une création d'entreprise", GROS_PATRIMOINE: 'un patrimoine important' }[s] || 'cette situation';
}

function screenLeverDetail() {
  const lever = CATALOGUE.find((l) => l.id === store.currentLeverId);
  if (!lever) return screenBilan();
  const result = lever.calcule(store.profile, store.data.fiscalParams);
  const surv = (store.data.veille.surveillances || []).find((s) => (s.leviers || []).includes(lever.id));
  return `<div class="screen">${header(lever.titre, 'bilan')}
    <div class="scroll">
      <div class="detail-top">${tag(result.coutNet)}</div>
      <h2 class="detail-title">${esc(lever.titre)}</h2>
      <div class="calc-box"><span class="calc-label">Calcul illustratif</span><p>${esc(result.texteCalcul)}</p><small>Estimation, à vérifier sur impots.gouv.fr.</small></div>
      ${result.avertissement ? `<p class="warn">⚠️ ${esc(result.avertissement)}</p>` : ''}
      ${surv ? `<div class="veille-box">⚠️ <strong>Règle susceptible d'évoluer</strong> (${esc(surv.horizon)}).<br>${esc(surv.nature_risque)}<br><small>Montant à jour pour ${store.data.fiscalParams.annee_declaration}. Statut : ${esc(surv.statut_actuel)}.</small></div>` : ''}
      <h3 class="section-h">Où agir</h3>
      <ol class="ou-agir">${lever.ouAgir.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <h3 class="section-h">Sources</h3>
      <p class="sources">${lever.sources.map((s) => `<span class="src">${esc(s)}</span>`).join('')}</p>
      <button class="btn-primary" data-module="${lever.moduleId}">Apprendre en 60 s</button>
      ${bandeauLegal()}
    </div>
  </div>`;
}

function screenModule() {
  const m = store.data.modules.find((x) => x.id === store.currentModuleId);
  if (!m) return screenBilan();
  // Garde-fou : un module premium non débloqué renvoie au paywall.
  if (m.premium && !store.premium) return screenPaywall('Ce module avancé fait partie de Boussole Premium.');
  const prog = store.progression[m.id] || {};
  return `<div class="screen">${header('Apprendre', store.currentLeverId ? 'lever-detail' : 'library')}
    <div class="scroll module">
      <div class="module-top">${tag(m.coutNet)}<span class="niveau">${esc(m.niveau)}</span></div>
      <h2>${esc(m.titre)}</h2>
      <p class="accroche">${esc(m.accroche)}</p>
      <div class="module-section"><span class="ms-label">En clair</span><p>${esc(m.contenu)}</p></div>
      ${m.piege ? `<div class="piege">⚠️ <strong>Le piège :</strong> ${esc(m.piege)}</div>` : ''}
      <div class="module-section"><span class="ms-label">Pour qui</span><p>${esc(m.pourQui)}</p></div>
      <div class="module-section"><span class="ms-label">Le calcul</span><p>${esc(m.calcul)}</p></div>
      <div class="module-section"><span class="ms-label">Où agir</span><ul>${m.ouAgir.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <p class="sources">${m.sources.map((s) => `<span class="src">${esc(s)}</span>`).join('')}</p>

      <div class="quiz" id="quiz" data-answer="${m.quiz.bonneReponse}">
        <h3>Quiz éclair</h3>
        <p class="quiz-q">${esc(m.quiz.question)}</p>
        <div class="quiz-opts">${m.quiz.options.map((o, i) => `<button class="quiz-opt" data-quiz="${i}">${esc(o)}</button>`).join('')}</div>
        <p class="quiz-explain" hidden>${esc(m.quiz.explication)}</p>
      </div>

      <button class="btn-ghost" data-action="approfondir" data-module-id="${m.id}">💬 Demander des précisions</button>
      <div class="approfondir-out" id="approOut" hidden></div>

      ${prog.fait ? '<p class="done-flag">✓ Module terminé</p>' : ''}
      ${bandeauLegal()}
    </div>
  </div>`;
}

function screenLibrary() {
  const carte = (m) => {
    const prog = store.progression[m.id] || {};
    const verrou = m.premium && !store.premium;
    // Module premium non débloqué -> renvoie au paywall ; sinon ouvre le module.
    const action = verrou ? `data-go="paywall"` : `data-module="${m.id}"`;
    return `<button class="lib-card${verrou ? ' lib-card-prem' : ''}" ${action}>
        <div class="lib-top">${tag(m.coutNet)}${verrou ? '<span class="lock">🔒</span>' : (prog.fait ? '<span class="done-dot">✓</span>' : '')}</div>
        <h3>${esc(m.titre)}</h3>
        <p>${esc(m.accroche)}</p>
        <span class="niveau">${esc(m.niveau)}${m.premium ? ' · Premium' : ''}</span>
      </button>`;
  };
  const mods = store.data.modules.slice().sort((a, b) => a.ordre - b.ordre);
  const socle = mods.filter((m) => !m.premium).map(carte).join('');
  const avances = mods.filter((m) => m.premium).map(carte).join('');
  return `<div class="screen">${header('Bibliothèque')}
    <div class="scroll">
      ${badge()}
      <p class="lib-intro">Modules de 60 secondes. Le socle (0–5) est gratuit et disponible hors-ligne.</p>
      <div class="lib-grid">${socle}</div>
      <h3 class="section-h">Modules avancés ${store.premium ? '' : '· Premium'}</h3>
      <p class="lib-intro">PER, assurance-vie, PEA, frais réels (barème km), rénovation énergétique.${store.premium ? '' : ' Débloque-les avec Premium.'}</p>
      <div class="lib-grid">${avances}</div>
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

function screenChecklist() {
  if (!store.premium) return screenPaywall('La checklist d\'actions datée et les rappels saisonniers sont une fonctionnalité Premium.');
  const out = orienter(store.profile, store.data.fiscalParams, store.data.veille);
  const items = out.leviers.flatMap((it) => it.lever.ouAgir.map((a) => ({ titre: it.lever.titre, action: a })));
  const moisRappels = rappelsSaisonniers();
  return `<div class="screen">${header('Ma checklist')}
    <div class="scroll">
      ${moisRappels ? `<div class="banniere">⏰ ${esc(moisRappels)}</div>` : ''}
      <h3 class="section-h">À faire pour mon profil</h3>
      <ul class="checklist">${items.map((it, i) => `<li><label><input type="checkbox" data-check="${i}"> <strong>${esc(it.titre)}</strong> — ${esc(it.action)}</label></li>`).join('')}</ul>
      <h3 class="section-h">Rappels saisonniers</h3>
      <ul class="rappels">
        <li>📅 <strong>Avril–juin</strong> : campagne de déclaration → vérifie tes crédits/réductions.</li>
        <li>📅 <strong>31 décembre</strong> : dernier moment pour verser sur PER/PEE au titre de l'année.</li>
      </ul>
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

function rappelsSaisonniers() {
  const m = new Date().getMonth() + 1;
  if (m >= 4 && m <= 6) return 'Campagne de déclaration en cours : vérifie que tu n\'oublies aucun crédit ni réduction.';
  if (m === 12) return 'Fin d\'année : dernier moment pour verser sur PER/PEE au titre de l\'année.';
  return null;
}

function screenPaywall(msg) {
  return `<div class="screen">${header('Premium', 'bilan')}
    <div class="scroll paywall">
      <div class="paywall-hero">🔓<h2>Passe à Boussole Premium</h2><p>${esc(msg || 'Moins cher qu\'une heure de conseiller — pour passer de comprendre à agir.')}</p></div>
      <div class="compare">
        <div class="col"><h3>Gratuit</h3><ul><li>Modules 0–5</li><li>Bilan : top 3 leviers</li><li>Filtre zéro dépense</li></ul></div>
        <div class="col col-prem"><h3>Premium</h3><ul><li>Tous les leviers chiffrés</li><li>Bibliothèque complète</li><li>Simulations ajustables</li><li>Checklist + rappels saisonniers</li><li>Vérif pré-déclaration</li></ul></div>
      </div>
      <button class="btn-primary" data-action="buy">Activer Premium (démo)</button>
      <p class="paywall-note">Intégration RevenueCat prévue (abonnement mensuel + annuel, grace period / billing retry). Ici : bascule de démonstration locale.</p>
      ${bandeauLegal()}
    </div>
  </div>`;
}

// ── Import de l'avis d'imposition (v2, SPEC §5/§12) ──
// Tout se passe SUR L'APPAREIL : le fichier est lu en local (pdf.js / OCR), seuls
// quelques chiffres sont extraits, le document n'est jamais envoyé ni conservé.
function screenAvisImport() {
  return `<div class="screen">${header('Importer mon avis', 'settings')}
    <div class="scroll">
      <div class="avis-intro">
        <h2>Affine ton bilan avec ton avis d'impôt</h2>
        <p>En lisant ton avis, l'app remplace ses estimations par <strong>tes vrais chiffres</strong> :
        taux marginal exact, nombre de parts, et surtout ton <strong>plafond PER personnel</strong>.</p>
      </div>
      <div class="avis-privacy">
        🔒 <strong>Confidentialité.</strong> Ton document est analysé <strong>uniquement sur cet appareil</strong>.
        Rien n'est envoyé sur un serveur. On n'en garde que quelques chiffres ; le fichier est aussitôt oublié.
        Tu pourras tout vérifier et corriger avant validation.
      </div>
      <label class="avis-drop" for="avisFile">
        <span class="avis-drop-icon">📄</span>
        <span><strong>Choisir mon avis</strong><br><small>PDF (impots.gouv.fr) ou photo de l'avis papier</small></span>
        <input type="file" id="avisFile" accept="application/pdf,image/*" hidden>
      </label>
      <div id="avisStatus" class="avis-status" hidden></div>
      <p class="avis-or">— ou —</p>
      <button class="btn-ghost" data-action="avisManuel">Saisir mes chiffres à la main</button>
      ${bandeauLegal()}
    </div>
  </div>`;
}

function champRow(label, key, value, type = 'number', suffix = '', hint = '') {
  const v = value == null ? '' : (type === 'pct' ? Math.round(value * 100) : value);
  const vide = value == null;
  return `<label class="champ-row${vide ? ' champ-vide' : ''}">
    <span class="champ-label">${esc(label)}${hint ? `<small class="champ-hint">${esc(hint)}</small>` : ''}</span>
    <span class="champ-input"><input type="number" step="any" data-champ="${key}" data-type="${type}" value="${v}" inputmode="decimal" placeholder="${vide ? 'à saisir' : ''}">${suffix ? `<em>${esc(suffix)}</em>` : ''}</span>
  </label>`;
}

function screenAvisValidation() {
  const a = store.avis || { champs: {}, confiance: 'FAIBLE', avertissements: [] };
  const c = a.champs;
  const confBadge = { BONNE: '🟢 Bonne lecture', PARTIELLE: '🟠 Lecture partielle', FAIBLE: '🔴 Lecture difficile' }[a.confiance] || '';
  return `<div class="screen">${header('Vérifie tes chiffres', 'avis-import')}
    <div class="scroll">
      <div class="avis-conf avis-conf-${a.confiance}">${confBadge} — <strong>vérifie et corrige</strong> avant de valider. L'app ne devine jamais à ta place.</div>
      ${a.avertissements.map((w) => `<p class="warn">⚠️ ${esc(w)}</p>`).join('')}
      <div class="champs">
        ${champRow("Revenu net imposable", 'revenuNetImposable', c.revenuNetImposable, 'number', '€', 'ligne « Revenu imposable »')}
        ${champRow("Nombre de parts", 'nombreParts', c.nombreParts, 'number', 'parts', 'en haut de l\'avis')}
        ${champRow("Taux marginal (TMI)", 'tmi', c.tmi, 'pct', '%', 'cadre « Taux marginal d\'imposition »')}
        ${champRow("Plafond épargne retraite (PER)", 'plafondPER', c.plafondPER, 'number', '€', 'cadre « Plafond épargne retraite » → ligne « Plafond pour les cotisations versées »')}
        ${champRow("Impôt net", 'impotNet', c.impotNet, 'number', '€', 'ligne « Impôt net » / « Impôt sur le revenu net »')}
      </div>
      <button class="btn-primary" data-action="avisValider">Utiliser ces chiffres dans mon bilan</button>
      <button class="btn-ghost" data-action="avisAnnuler">Annuler</button>
      <p class="avis-privacy-mini">🔒 Ces valeurs restent sur ton appareil. Le document importé n'a pas été conservé.</p>
      ${bandeauLegal()}
    </div>
  </div>`;
}

// ── Niches fiscales : panorama + adéquation au profil ─────────────────────────
const NICHE_LABEL = {
  ADAPTEE: { txt: '✅ Adaptée à ton profil', cls: 'niche-ok', ordre: 0 },
  SOUS_CONDITIONS: { txt: '🟠 Sous conditions', cls: 'niche-cond', ordre: 1 },
  A_EXPLORER: { txt: '🔎 À explorer', cls: 'niche-expl', ordre: 2 },
  SANS_OBJET: { txt: '⚪️ Sans objet pour toi', cls: 'niche-na', ordre: 3 },
};
const NICHE_TYPE = {
  CREDIT: 'Crédit d\'impôt', REDUCTION: 'Réduction d\'impôt', DEDUCTION: 'Déduction du revenu',
  EXONERATION: 'Exonération', AIDE: 'Aide',
};

function nicheCard({ niche, statut, raison }) {
  const L = NICHE_LABEL[statut] || NICHE_LABEL.A_EXPLORER;
  const aLevier = niche.leverId && CATALOGUE.find((l) => l.id === niche.leverId);
  return `<article class="niche-card ${L.cls}">
    <div class="niche-head">${tag(niche.coutNet)}<span class="niche-statut">${L.txt}</span>${niche.type ? `<span class="niche-type">${esc(NICHE_TYPE[niche.type] || niche.type)}</span>` : ''}</div>
    <h3>${esc(niche.titre)}</h3>
    <p class="niche-principe">${esc(niche.principe)}</p>
    <p class="niche-raison">${esc(raison)}</p>
    <ul class="niche-cond">${(niche.conditionsClefs || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    ${niche.plafonnement_global ? '<p class="niche-plafond">↳ Entre dans le plafond global des niches (10 000 €/an).</p>' : ''}
    <div class="niche-actions">
      ${niche.moduleId ? `<button class="btn-small" data-module="${niche.moduleId}">Apprendre (60 s)</button>` : ''}
      ${aLevier ? `<button class="btn-small btn-small-ghost" data-lever-detail="${niche.leverId}">Où agir</button>` : ''}
    </div>
    <p class="niche-src">${(niche.sources || []).map((s) => `<span class="src">${esc(s)}</span>`).join('')}${niche.article ? `<span class="src src-cgi">${esc(niche.article)}</span>` : ''}</p>
  </article>`;
}

function screenNiches() {
  const niches = store.data.niches || [];
  if (!store.profile) return screenOnboarding();
  const res = adequationNiches(store.profile, niches, store.data.fiscalParams);
  const cats = store.data.nichesCategories || [];

  // Regroupement par catégorie (si dispo), tri interne par pertinence pour le profil.
  let corps = '';
  if (cats.length) {
    const byId = {};
    res.forEach((r) => { (byId[r.niche.categorie] = byId[r.niche.categorie] || []).push(r); });
    corps = cats.map((cat) => {
      const items = (byId[cat.id] || []).sort((a, b) => NICHE_LABEL[a.statut].ordre - NICHE_LABEL[b.statut].ordre);
      if (!items.length) return '';
      return `<h3 class="section-h">${esc(cat.titre)}</h3><div class="niche-list">${items.map(nicheCard).join('')}</div>`;
    }).join('');
  } else {
    const sorted = res.slice().sort((a, b) => NICHE_LABEL[a.statut].ordre - NICHE_LABEL[b.statut].ordre);
    corps = `<div class="niche-list">${sorted.map(nicheCard).join('')}</div>`;
  }

  const nbAdaptees = res.filter((r) => r.statut === 'ADAPTEE').length;

  return `<div class="screen">${header('Niches fiscales', 'bilan')}
    <div class="scroll">
      ${badge()}
      <p class="lib-intro">Panorama des principaux dispositifs accessibles aux particuliers (${res.length}), classés selon <strong>ton profil déclaré</strong>. <strong>${nbAdaptees}</strong> ressortent comme adaptées. Indicatif et non exhaustif — l'éligibilité exacte se vérifie sur impots.gouv.fr.</p>
      ${corps}
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

// ── Droits sociaux : panorama + adéquation au profil + chiffrage opt-in ───
const DROIT_LABEL = {
  PRIORITAIRE: { txt: '🟢 À simuler en priorité', cls: 'niche-ok', ordre: 0 },
  A_EXPLORER: { txt: '🔎 À explorer', cls: 'niche-expl', ordre: 1 },
  PEU_PROBABLE: { txt: '⚪️ Peu probable', cls: 'niche-na', ordre: 2 },
};

function droitCard({ aide, statut, raison }) {
  const L = DROIT_LABEL[statut] || DROIT_LABEL.A_EXPLORER;
  return `<article class="niche-card ${L.cls}">
    <div class="niche-head"><span class="niche-statut">${L.txt}</span>${aide.organisme ? `<span class="niche-type">${esc(aide.organisme)}</span>` : ''}</div>
    <h3>${esc(aide.titre)}</h3>
    <p class="niche-principe">${esc(aide.principe)}</p>
    <p class="niche-raison">${esc(raison)}</p>
    <ul class="niche-cond">${(aide.conditionsClefs || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <div class="niche-actions">
      ${aide.lien ? `<a class="btn-small btn-small-ghost" href="${esc(aide.lien)}" target="_blank" rel="noopener">En savoir plus ↗</a>` : ''}
    </div>
    <p class="niche-src">${(aide.sources || []).map((s) => `<span class="src">${esc(s)}</span>`).join('')}</p>
  </article>`;
}

function blocEstimationDroits() {
  const p = store.profile || {};
  // Pré-remplissage doux à partir du profil (jamais de valeur exacte devinée).
  const couple = p.situationFamiliale === 'COUPLE' ? 'COUPLE' : 'SEUL';
  const nbEnf = Number(p.nbCharges) || 0;
  // Pré-remplissage du revenu : on prend le milieu de la tranche déclarée au profil
  // (le profil ne stocke qu'une fourchette, jamais un montant exact). Modifiable.
  const REV_MID = { '<1500': 1200, '1500-2500': 2000, '2500-4000': 3200, '4000-6000': 5000, '>6000': 7000 };
  const revPre = REV_MID[p.revenuMensuelFoyer] || '';
  const revHint = revPre ? 'estimé depuis ta tranche de profil — ajuste avec ton montant exact' : 'salaires nets, hors prestations';
  return `<div class="droits-estim">
    <h3 class="section-h">Estimer mes aides (RSA, prime d'activité, logement, prestations familiales…)</h3>
    <div class="avis-conf avis-conf-PARTIELLE">
      ⚠️ <strong>Ce calcul sort de ton appareil.</strong> À ta demande, les éléments saisis ci-dessous
      (sans nom ni identité) sont envoyés au moteur public <strong>OpenFisca</strong> de l'État pour produire
      une estimation indicative. Le reste de Boussole, lui, ne transmet rien. Le simulateur officiel reste la référence.
    </div>
    <div class="champs">
      <label class="champ-row"><span class="champ-label">Revenu net mensuel du foyer<small class="champ-hint">${revHint}</small></span>
        <span class="champ-input"><input type="number" step="any" inputmode="decimal" id="estRevenu" value="${revPre}" placeholder="ex : 1500"><em>€</em></span></label>
      <label class="champ-row"><span class="champ-label">Situation</span>
        <span class="champ-input"><select id="estSituation"><option value="SEUL"${couple === 'SEUL' ? ' selected' : ''}>Seul(e)</option><option value="COUPLE"${couple === 'COUPLE' ? ' selected' : ''}>En couple</option></select></span></label>
      <label class="champ-row"><span class="champ-label">Enfants à charge</span>
        <span class="champ-input"><input type="number" step="1" min="0" inputmode="numeric" id="estEnfants" value="${nbEnf}"></span></label>
      <label class="champ-row"><span class="champ-label">Loyer mensuel<small class="champ-hint">0 si tu n'es pas locataire</small></span>
        <span class="champ-input"><input type="number" step="any" inputmode="decimal" id="estLoyer" placeholder="ex : 700"><em>€</em></span></label>
      <label class="champ-row"><span class="champ-label">Code postal<small class="champ-hint">facultatif — affine la zone de l'aide au logement</small></span>
        <span class="champ-input"><input type="text" inputmode="numeric" id="estCodePostal" placeholder="ex : 75011" maxlength="5"></span></label>
    </div>
    <button class="btn-primary" data-action="estimerDroits">Estimer avec OpenFisca</button>
    <div class="approfondir-out" id="estimOut" hidden></div>
    <p class="avis-privacy-mini">🔒 Aucune donnée nominative n'est demandée ni conservée. Estimation indicative, non opposable.</p>
  </div>`;
}

function screenDroits() {
  const aides = store.data.droits || [];
  if (!store.profile) return screenOnboarding();
  const res = adequationDroits(store.profile, aides);
  const cats = store.data.droitsCategories || [];
  const simulateur = store.data.droitsSimulateur || 'https://www.mesdroitssociaux.gouv.fr';

  let corps = '';
  if (cats.length) {
    const byId = {};
    res.forEach((r) => { (byId[r.aide.categorie] = byId[r.aide.categorie] || []).push(r); });
    corps = cats.map((cat) => {
      const items = (byId[cat.id] || []).sort((a, b) => DROIT_LABEL[a.statut].ordre - DROIT_LABEL[b.statut].ordre);
      if (!items.length) return '';
      return `<h3 class="section-h">${esc(cat.titre)}</h3><div class="niche-list">${items.map(droitCard).join('')}</div>`;
    }).join('');
  } else {
    const sorted = res.slice().sort((a, b) => DROIT_LABEL[a.statut].ordre - DROIT_LABEL[b.statut].ordre);
    corps = `<div class="niche-list">${sorted.map(droitCard).join('')}</div>`;
  }

  const nbPrio = res.filter((r) => r.statut === 'PRIORITAIRE').length;

  return `<div class="screen">${header('Droits sociaux', 'bilan')}
    <div class="scroll">
      ${badge()}
      <p class="lib-intro">Renseigne tes montants pour estimer tes aides, puis explore le panorama des dispositifs. Pour beaucoup de profils, des droits non réclamés pèsent plus lourd que toute optimisation fiscale.</p>
      ${blocEstimationDroits()}
      <a class="btn-primary" href="${esc(simulateur)}" target="_blank" rel="noopener">🧮 Ouvrir le simulateur officiel ↗</a>
      <h3 class="section-h">Panorama des aides (${res.length}) — ${nbPrio} à simuler en priorité pour ton profil</h3>
      ${corps}
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

// ── Chiffrage personnel en euros réels ────────────────────────────────
// Quand l'avis est chargé, on dispose du revenu net imposable, des parts et de la TMI
// EXACTS : on recalcule l'IR par le barème (engine.calcIR) et on simule l'économie d'un
// versement PER par DIFFÉRENCE de barème (exact, gère le franchissement de tranche),
// bornée au plafond réel. Aucun montant n'est conseillé : l'utilisateur saisit le sien.
function screenChiffrage() {
  if (!store.profile) return screenOnboarding();
  const p = store.profile;
  const params = store.data.fiscalParams;
  const aAvis = p.sourceAvis && typeof p.revenuNetImposableExact === 'number' && typeof p.nombrePartsExact === 'number';

  let synth;
  if (aAvis) {
    const ir = calcIR(p.revenuNetImposableExact, p.nombrePartsExact, params);
    const tmi = estimeTMI(p);
    synth = `<div class="calc-box">
      <span class="calc-label">D'après ton avis d'impôt</span>
      <p>Revenu net imposable : <strong>${EURO(p.revenuNetImposableExact)}</strong> · ${p.nombrePartsExact} part(s) · tranche ${Math.round(tmi * 100)} %</p>
      <p>Impôt sur le revenu recalculé : <strong>${EURO(ir)}</strong></p>
      <small>Barème ${esc(params.version)}, quotient familial simplifié. Indicatif (hors crédits/réductions déjà acquis et cas particuliers) — ton avis fait foi.</small>
    </div>`;
  } else {
    synth = `<div class="avis-conf avis-conf-PARTIELLE">Pour un chiffrage en <strong>euros réels</strong> (et non des exemples), <button class="lien-inline" data-go="avis-import">importe ton avis d'impôt</button>. Sans lui, on estime avec ta tranche déclarée (${Math.round(estimeTMI(p) * 100)} %).</div>`;
  }

  const plafondInfo = (typeof p.plafondPERExact === 'number' && p.plafondPERExact > 0)
    ? `Ton plafond de déduction disponible : <strong>${EURO(p.plafondPERExact)}</strong> (lu sur ton avis).`
    : `Ton plafond exact figure sur ton avis (cadre « Plafond épargne retraite »).`;

  return `<div class="screen">${header('Mon chiffrage', 'bilan')}
    <div class="scroll">
      ${badge()}
      ${synth}
      <h3 class="section-h">Simuler un versement PER</h3>
      <p class="lib-intro">Combien d'impôt un versement sur un PER te ferait-il économiser cette année ? ${plafondInfo}</p>
      <div class="champs">
        <label class="champ-row"><span class="champ-label">Montant que je verserais</span>
          <span class="champ-input"><input type="number" step="any" inputmode="decimal" id="perMontant" placeholder="ex : 2000"><em>€</em></span></label>
      </div>
      <div class="appro-card" id="perOut">Saisis un montant pour voir l'économie d'impôt et ton effort d'épargne réel.</div>
      <p class="warn">⚠️ L'argent versé sur un PER est bloqué jusqu'à la retraite (sauf cas de déblocage). On ne te conseille aucun montant : à toi de décider ce que tu peux immobiliser.</p>
      ${bandeauLegal()}
    </div>
    ${tabbar()}
  </div>`;
}

// Recalcule l'économie d'IR d'un versement PER, en direct (sans re-rendre l'écran).
function simulerPER() {
  const inp = document.getElementById('perMontant');
  const out = document.getElementById('perOut');
  if (!inp || !out) return;
  const p = store.profile;
  const params = store.data.fiscalParams;
  let versement = Math.max(0, Number(inp.value) || 0);
  if (!versement) { out.innerHTML = 'Saisis un montant pour voir l\'économie d\'impôt et ton effort d\'épargne réel.'; return; }

  const plafond = (typeof p.plafondPERExact === 'number' && p.plafondPERExact > 0) ? p.plafondPERExact : null;
  let note = '';
  if (plafond && versement > plafond) { versement = plafond; note = ` (limité à ton plafond de ${EURO(plafond)})`; }

  let economie;
  if (p.sourceAvis && typeof p.revenuNetImposableExact === 'number' && typeof p.nombrePartsExact === 'number') {
    const r = p.revenuNetImposableExact;
    const parts = p.nombrePartsExact;
    economie = calcIR(r, parts, params) - calcIR(Math.max(0, r - versement), parts, params);
  } else {
    economie = versement * estimeTMI(p); // estimation par la tranche déclarée
  }
  economie = Math.max(0, Math.round(economie));
  const effort = Math.max(0, Math.round(versement - economie));
  out.innerHTML = `Économie d'impôt estimée : <strong>${EURO(economie)}</strong>${note}.<br>`
    + `Ton effort d'épargne réel : <strong>${EURO(effort)}</strong> — le reste (${EURO(economie)}) est de l'impôt en moins, mais reste de l'épargne <em>à toi</em>, simplement bloquée.`;
}

function screenSettings() {
  const fp = store.data.fiscalParams;
  return `<div class="screen">${header('Réglages')}
    <div class="scroll">
      ${badge()}
      <div class="set-group">
        <button class="set-row" data-action="restart">🔄 Refaire mon profil</button>
        <button class="set-row" data-go="avis-import">📄 Importer mon avis d'impôt ${store.profile && store.profile.sourceAvis ? '<span class="set-flag">✓ chiffres exacts actifs</span>' : '<span class="set-flag set-flag-soft">affiner le bilan</span>'}</button>
        <div class="set-row set-row-toggle"><span>${store.premium ? '⭐ Premium actif' : '🔒 Version gratuite'}</span><button class="btn-small" data-action="togglePrem">${store.premium ? 'Désactiver' : 'Activer (démo)'}</button></div>
      </div>
      <h3 class="section-h">Sources &amp; données fiscales</h3>
      <p class="set-meta">Cadre légal : ${esc(fp.cadre_legal)}<br>Revenus ${fp.annee_revenus} · déclaration ${fp.annee_declaration}<br>Version ${esc(fp.version)} · maj ${esc(fp.date_maj)} · chargé via <em>${esc(store.data.source)}</em></p>
      <p class="set-meta">Sources officielles : Légifrance, BOFiP, service-public.fr, impots.gouv.fr, Urssaf, mesdroitssociaux.gouv.fr.</p>
      <h3 class="section-h">Surveillance fiscale</h3>
      <ul class="surv-list">${(store.data.veille.surveillances || []).map((s) => `<li><strong>${esc(s.parametre)}</strong> — ${esc(s.statut_actuel)} <em>(${esc(s.probabilite_evolution)}, ${esc(s.horizon)})</em></li>`).join('')}</ul>
      <h3 class="section-h">Mentions légales</h3>
      <p class="set-meta">${BANDEAU_LEGAL}</p>
      <p class="set-meta">Données stockées localement sur cet appareil (profil + progression). Aucune donnée bancaire, aucun compte, aucun tracking.</p>
    </div>
    ${tabbar()}
  </div>`;
}

// ── Rendu + délégation d'événements ──
function render() {
  const screens = {
    onboarding: screenOnboarding, profiling: screenProfiling, bilan: screenBilan,
    'lever-detail': screenLeverDetail, module: screenModule, library: screenLibrary,
    checklist: screenChecklist, paywall: () => screenPaywall(), settings: screenSettings,
    'avis-import': screenAvisImport, 'avis-validation': screenAvisValidation,
    niches: screenNiches, droits: screenDroits, chiffrage: screenChiffrage,
  };
  app.innerHTML = (screens[store.route] || screenOnboarding)();
}

function finProfilage() {
  store.draft.filtreZeroDepense = store.draft.filtreZeroDepense ?? true;
  store.draft.nbCharges = Number(store.draft.nbCharges);
  store.profile = { ...store.draft };
  save();
  go('bilan');
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-go],[data-action],[data-pick],[data-module],[data-lever],[data-lever-detail],[data-quiz]');
  if (!t) return;

  if (t.dataset.go) return go(t.dataset.go);

  if (t.dataset.pick !== undefined) {
    const Q = QUESTIONS[store.step];
    store.draft[Q.field] = Q.field === 'nbCharges' ? Number(t.dataset.pick) : t.dataset.pick;
    if (store.step < QUESTIONS.length - 1) { store.step++; render(); window.scrollTo(0, 0); }
    else finProfilage();
    return;
  }

  if (t.dataset.module) return go('module', { currentModuleId: t.dataset.module, currentLeverId: null });
  if (t.dataset.leverDetail) return go('lever-detail', { currentLeverId: t.dataset.leverDetail });
  if (t.dataset.lever) return go('lever-detail', { currentLeverId: t.dataset.lever });

  if (t.dataset.quiz !== undefined) return handleQuiz(t);

  const a = t.dataset.action;
  if (a === 'start') { store.draft = {}; store.step = 0; return go('profiling'); }
  if (a === 'prev') { if (store.step > 0) { store.step--; render(); } return; }
  if (a === 'restart') { store.draft = {}; store.step = 0; store.avis = null; return go('profiling'); }
  if (a === 'buy' || a === 'togglePrem') { store.premium = a === 'buy' ? true : !store.premium; save(); return go(a === 'buy' ? 'bilan' : 'settings'); }
  if (a === 'approfondir') return approfondir(t.dataset.moduleId);
  if (a === 'avisManuel') { store.avis = { champs: {}, confiance: 'FAIBLE', avertissements: [] }; return go('avis-validation'); }
  if (a === 'avisAnnuler') { store.avis = null; return go('settings'); }
  if (a === 'avisValider') return validerAvis();
  if (a === 'estimerDroits') return estimerDroits();
});

// Simulateur PER : recalcul en direct à chaque frappe.
app.addEventListener('input', (e) => {
  if (e.target.id === 'perMontant') simulerPER();
});

// filtre zéro dépense (toggle) + import de fichier avis
app.addEventListener('change', (e) => {
  if (e.target.id === 'zeroDep') {
    store.profile.filtreZeroDepense = e.target.checked;
    save();
    render();
    return;
  }
  if (e.target.id === 'avisFile' && e.target.files && e.target.files[0]) {
    traiterFichierAvis(e.target.files[0]);
  }
});

// Extraction LOCALE du texte de l'avis (PDF via pdf.js, image via tesseract.js),
// chargées à la demande depuis un CDN. Aucune donnée n'est envoyée : les libs
// tournent dans le navigateur, le fichier ne quitte jamais l'appareil.
const CDN = {
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js',
};

function setAvisStatus(html) {
  const el = document.getElementById('avisStatus');
  if (el) { el.hidden = false; el.innerHTML = html; }
}

async function extraireTextePDF(file) {
  const pdfjs = await import(/* @vite-ignore */ CDN.pdfjs);
  // Le worker est sur un autre domaine (CDN). On le charge en blob same-origin pour
  // éviter le blocage cross-origin du constructeur Worker (cause n°1 d'échec pdf.js v4).
  if (pdfjs.GlobalWorkerOptions) {
    try {
      const code = await (await fetch(CDN.pdfWorker)).text();
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
        new Blob([code], { type: 'text/javascript' }),
      );
    } catch (_) {
      pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker; // repli : URL directe
    }
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let texte = '';
  const max = Math.min(pdf.numPages, 4); // l'info utile est sur les 1res pages
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texte += ' ' + content.items.map((it) => (it.str || '')).join(' ');
  }
  return texte;
}

async function extraireTexteImage(file) {
  const mod = await import(/* @vite-ignore */ CDN.tesseract);
  const Tesseract = mod.default || mod;
  setAvisStatus('🔍 Lecture de l\'image (OCR) en cours sur ton appareil… cela peut prendre quelques secondes.');
  const { data } = await Tesseract.recognize(file, 'fra');
  return data.text || '';
}

async function traiterFichierAvis(file) {
  try {
    setAvisStatus('⏳ Analyse du document sur ton appareil…');
    const isPDF = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const texte = isPDF ? await extraireTextePDF(file) : await extraireTexteImage(file);
    // PDF scanné (image, sans couche texte) -> peu/pas de texte : on signale et on bascule.
    if (isPDF && texte.replace(/\s/g, '').length < 30) {
      throw new Error('PDF sans texte sélectionnable (probablement scanné). Réessaie avec une photo de l\'avis (lecture par OCR), ou saisis tes chiffres à la main.');
    }
    const res = parseAvisText(texte);
    store.avis = res; // on garde seulement le texte extrait/les champs, pas le fichier
    go('avis-validation');
  } catch (err) {
    const cause = !navigator.onLine
      ? 'Hors-ligne : la lecture PDF/photo nécessite une connexion la première fois (téléchargement de l\'outil de lecture).'
      : `Détail : ${esc(String(err && err.message ? err.message : err))}`;
    setAvisStatus(
      `⚠️ <strong>Lecture automatique impossible.</strong><br>${cause}<br>` +
        `Tu peux <strong>saisir tes chiffres à la main</strong> avec le bouton ci-dessous.`,
    );
  }
}

// Applique les chiffres validés au profil, puis recalcule le bilan.
function validerAvis() {
  // On relit les inputs (l'utilisateur a pu corriger).
  const champs = {};
  document.querySelectorAll('[data-champ]').forEach((input) => {
    const key = input.dataset.champ;
    const raw = input.value.trim();
    if (raw === '') { champs[key] = null; return; }
    let n = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(n)) { champs[key] = null; return; }
    if (input.dataset.type === 'pct') n = n > 1 ? n / 100 : n; // % saisi -> fraction
    champs[key] = n;
  });
  const patch = profilDepuisAvis(champs);
  if (!store.profile) store.profile = {};
  Object.assign(store.profile, patch);
  store.avis = null;
  save();
  go('bilan');
}

function handleQuiz(btn) {
  const quiz = document.getElementById('quiz');
  const good = Number(quiz.dataset.answer);
  const picked = Number(btn.dataset.quiz);
  quiz.querySelectorAll('.quiz-opt').forEach((b, i) => {
    b.disabled = true;
    if (i === good) b.classList.add('correct');
    else if (i === picked) b.classList.add('wrong');
  });
  quiz.querySelector('.quiz-explain').hidden = false;
  const id = store.currentModuleId;
  store.progression[id] = { fait: true, quizOk: picked === good };
  save();
}

// Cache local des réponses « Approfondir » : une même demande (module + version des
// paramètres fiscaux) n'appelle l'API qu'une fois. Économise les appels facturés et
// permet de relire hors-ligne. Clé liée à la version des params : un changement de
// fiscal-params.json invalide naturellement le cache.
const APPRO_CACHE_KEY = 'boussole.approCache.v1';
function approCacheLire(k) {
  try { return (JSON.parse(localStorage.getItem(APPRO_CACHE_KEY)) || {})[k] || null; } catch (_) { return null; }
}
function approCacheEcrire(k, data) {
  try {
    const c = JSON.parse(localStorage.getItem(APPRO_CACHE_KEY)) || {};
    c[k] = data;
    localStorage.setItem(APPRO_CACHE_KEY, JSON.stringify(c));
  } catch (_) { /* quota plein : on ignore, ce n'est qu'un cache */ }
}

function renduAppro(out, data, cached) {
  out.innerHTML = `<div class="appro-card"><p>${esc(data.reponse || '')}</p>${data.sources ? `<small>Sources : ${esc((data.sources || []).join(', '))}${cached ? ' · réponse mémorisée' : ''}</small>` : ''}</div>`;
}

async function approfondir(moduleId) {
  const out = document.getElementById('approOut');
  out.hidden = false;
  const m = store.data.modules.find((x) => x.id === moduleId);
  const cacheKey = `${moduleId}@${store.data.fiscalParams.version}`;

  // 1) Cache : si déjà demandé, on réutilise (aucun appel API).
  const hit = approCacheLire(cacheKey);
  if (hit) { renduAppro(out, hit, true); return; }

  out.innerHTML = '<p class="loading">Recherche dans la base de connaissances…</p>';
  try {
    const res = await fetch('/api/approfondir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moduleId,
        question: `Donne une précision pédagogique sur : ${m.titre}`,
        fiscalParams: extraitPertinent(moduleId),
      }),
    });
    if (!res.ok) throw new Error('proxy indisponible');
    const data = await res.json();
    if (data.reponse) approCacheEcrire(cacheKey, { reponse: data.reponse, sources: data.sources || [] });
    renduAppro(out, data, false);
  } catch (err) {
    out.innerHTML = `<div class="appro-card appro-offline"><p>L'approfondissement à la demande nécessite une connexion et le proxy Claude (clé API côté serveur). Hors-ligne, le module ci-dessus reste complet et fiable.</p><small>Configure ANTHROPIC_API_KEY sur Vercel pour activer cette fonction.</small></div>`;
  }
}

// On ne transmet au proxy qu'un extrait pertinent des paramètres (bornage anti-hallucination §7.2)
function extraitPertinent(moduleId) {
  const fp = store.data.fiscalParams;
  const map = {
    credit_domicile: ['credit_emploi_domicile'], frais_reels: ['frais_reels', 'bareme_ir'],
    dons: ['dons'], epargne_salariale_pee: ['epargne_salariale'], aides_non_reclamees: [],
  };
  const keys = map[moduleId] || [];
  const sub = { version: fp.version, date_maj: fp.date_maj, cadre_legal: fp.cadre_legal };
  keys.forEach((k) => { sub[k] = fp[k]; });
  return sub;
}

// Chiffrage opt-in des droits sociaux via le proxy OpenFisca (/api/droits-estimation).
// Seul appel de l'app qui transmet des données — déclenché uniquement sur action explicite.
const EURO = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
const LIBELLE_AIDE = {
  rsa: 'RSA', prime_activite: "Prime d'activité", aide_logement: 'Aide au logement',
  allocations_familiales: 'Allocations familiales', complement_familial: 'Complément familial',
  asf: 'Allocation de soutien familial', ars: 'Allocation de rentrée scolaire',
};

async function estimerDroits() {
  const out = document.getElementById('estimOut');
  if (!out) return;
  const val = (id) => (document.getElementById(id) || {}).value;
  const payload = {
    revenuNetMensuel: Number(val('estRevenu')) || 0,
    situation: val('estSituation') || 'SEUL',
    nbEnfants: Number(val('estEnfants')) || 0,
    loyer: Number(val('estLoyer')) || 0,
    codePostal: (val('estCodePostal') || '').trim(),
  };
  out.hidden = false;
  out.innerHTML = '<p class="loading">Estimation en cours via le moteur public OpenFisca…</p>';
  try {
    const res = await fetch('/api/droits-estimation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.estimations)) throw new Error(data.message || 'indisponible');
    const lignes = data.estimations.map(({ id, montant, periode }) => {
      const lib = LIBELLE_AIDE[id] || id;
      if (montant === null) return `<li>${esc(lib)} : <em>non calculable avec ces éléments</em></li>`;
      const par = periode === 'an' ? '/ an' : '/ mois';
      return `<li><strong>${esc(lib)}</strong> : ${montant > 0 ? '≈ ' + EURO(montant) + ' ' + par : 'aucun droit estimé'}</li>`;
    }).join('');
    out.innerHTML = `<div class="appro-card"><ul class="estim-list">${lignes}</ul><small>⚠️ ${esc(data.avertissement || '')} Source : ${esc(data.moteur || 'OpenFisca')}.</small></div>`;
  } catch (err) {
    out.innerHTML = `<div class="appro-card appro-offline"><p>${esc(String(err && err.message ? err.message : err))}</p><small>Le panorama ci-dessus et le simulateur officiel restent disponibles.</small></div>`;
  }
}

// ── Boot ──
async function boot() {
  restore();
  app.innerHTML = '<div class="boot">🧭<p>Chargement…</p></div>';
  store.data = await loadData();
  store.route = store.profile ? 'bilan' : 'onboarding';
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
boot();
