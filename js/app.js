// Boussole — app PWA d'éducation & d'orientation à l'optimisation financière.
// SPEC : profilage (§5) → moteur d'orientation (§6) → micro-learning (§7).
import { loadData } from './data.js';
import { orienter, estimeTMI, badgeFraicheur, CATALOGUE } from './engine.js';
import { parseAvisText, profilDepuisAvis } from './avis.js';

const BANDEAU_LEGAL =
  "Informations pédagogiques fondées sur les règles fiscales en vigueur. Ce n'est pas un conseil personnalisé. Vérifie ta situation sur impots.gouv.fr ou auprès d'un professionnel.";

const TAGS = {
  GRATUIT: { emoji: '🟢', label: 'Gratuit' },
  REORIENTATION: { emoji: '🔵', label: 'Réorientation' },
  DEPENSE: { emoji: '🟠', label: 'Dépense' },
};

// ── Profilage : 15 questions (§5) ────────────────────────────────────────
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

// ── État global + persistance ────────────────────────────────────────
const store = {
  route: 'onboarding',
  data: null,
  profile: null,
  draft: {},        // profil en cours de saisie
  step: 0,
  premium: false,
  progression: {},  // { moduleId: { fait: true, quizOk: bool } }
  currentLeverId: null,
  currentModuleId: null,
  avis: null,        // { champs, confiance, avertissements } en cours de validation (jamais persisté tel quel)
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

// ── Composants réutilisables ───────────────────────────────────────
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

// ── Écrans ──────────────────────────────────────────────────
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
  const cards = store.data.modules
    .slice()
    .sort((a, b) => a.ordre - b.ordre)
    .map((m) => {
      const prog = store.progression[m.id] || {};
      return `<button class="lib-card" data-module="${m.id}">
        <div class="lib-top">${tag(m.coutNet)}${prog.fait ? '<span class="done-dot">✓</span>' : ''}</div>
        <h3>${esc(m.titre)}</h3>
        <p>${esc(m.accroche)}</p>
        <span class="niveau">${esc(m.niveau)}</span>
      </button>`;
    }).join('');
  return `<div class="screen">${header('Bibliothèque')}
    <div class="scroll">
      ${badge()}
      <p class="lib-intro">Modules de 60 secondes. Le socle (0–5) est gratuit et disponible hors-ligne. La bibliothèque avancée (PER, assurance-vie, PEA, barème km, rénovation) arrive en Premium.</p>
      <div class="lib-grid">${cards}</div>
      <div class="lib-card lib-card-locked" data-go="paywall"><div class="lib-top">🔒</div><h3>Modules avancés 6–10</h3><p>PER détaillé, assurance-vie, PEA, frais réels (barème km), rénovation énergétique.</p><span class="niveau">Premium</span></div>
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

// ── Import de l'avis d'imposition (v2, SPEC §5/§12) ────────────────────────
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

function champRow(label, key, value, type = 'number', suffix = '') {
  const v = value == null ? '' : (type === 'pct' ? Math.round(value * 100) : value);
  return `<label class="champ-row">
    <span>${esc(label)}</span>
    <span class="champ-input"><input type="number" step="any" data-champ="${key}" data-type="${type}" value="${v}" inputmode="decimal">${suffix ? `<em>${esc(suffix)}</em>` : ''}</span>
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
        ${champRow("Revenu net imposable", 'revenuNetImposable', c.revenuNetImposable, 'number', '€')}
        ${champRow("Nombre de parts", 'nombreParts', c.nombreParts, 'number', 'parts')}
        ${champRow("Taux marginal (TMI)", 'tmi', c.tmi, 'pct', '%')}
        ${champRow("Plafond épargne retraite (PER)", 'plafondPER', c.plafondPER, 'number', '€')}
        ${champRow("Impôt net", 'impotNet', c.impotNet, 'number', '€')}
      </div>
      <button class="btn-primary" data-action="avisValider">Utiliser ces chiffres dans mon bilan</button>
      <button class="btn-ghost" data-action="avisAnnuler">Annuler</button>
      <p class="avis-privacy-mini">🔒 Ces valeurs restent sur ton appareil. Le document importé n'a pas été conservé.</p>
      ${bandeauLegal()}
    </div>
  </div>`;
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

// ── Rendu + délégation d'événements ─────────────────────────────────
function render() {
  const screens = {
    onboarding: screenOnboarding, profiling: screenProfiling, bilan: screenBilan,
    'lever-detail': screenLeverDetail, module: screenModule, library: screenLibrary,
    checklist: screenChecklist, paywall: () => screenPaywall(), settings: screenSettings,
    'avis-import': screenAvisImport, 'avis-validation': screenAvisValidation,
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
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js',
};

function setAvisStatus(html) {
  const el = document.getElementById('avisStatus');
  if (el) { el.hidden = false; el.innerHTML = html; }
}

async function extraireTextePDF(file) {
  const pdfjs = await import(/* @vite-ignore */ CDN.pdfjs);
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let texte = '';
  const max = Math.min(pdf.numPages, 4); // l'info utile est sur les 1res pages
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texte += ' ' + content.items.map((it) => it.str).join(' ');
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
    const res = parseAvisText(texte);
    store.avis = res; // on garde seulement le texte extrait/les champs, pas le fichier
    go('avis-validation');
  } catch (err) {
    setAvisStatus(
      `⚠️ Lecture automatique impossible ${navigator.onLine ? '' : '(hors-ligne : l\'analyse PDF/image nécessite une connexion la 1re fois)'}. ` +
        `Tu peux <strong>saisir tes chiffres à la main</strong> ci-dessous.`,
    );
    // Laisse l'utilisateur basculer en saisie manuelle.
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

async function approfondir(moduleId) {
  const out = document.getElementById('approOut');
  out.hidden = false;
  out.innerHTML = '<p class="loading">Recherche dans la base de connaissances…</p>';
  const m = store.data.modules.find((x) => x.id === moduleId);
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
    out.innerHTML = `<div class="appro-card"><p>${esc(data.reponse || '')}</p>${data.sources ? `<small>Sources : ${esc((data.sources || []).join(', '))}</small>` : ''}</div>`;
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

// ── Boot ────────────────────────────────────────────────────
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
