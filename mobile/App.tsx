// Boussole — App React Native (SPEC). Navigation simple par état (MVP) ;
// pour la prod, migrer vers @react-navigation/native. Réutilise shared/engine.
import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import { orienter, estimeTMI, badgeFraicheur, CATALOGUE } from '@shared/engine/engine';
import { UserProfile, LeverResult, Lever, Surveillance } from '@shared/engine/types';
import { loadData, AppData } from './src/data';
import { QUESTIONS } from './src/questions';
import * as Store from './src/storage';
import { C, TAGS, BANDEAU_LEGAL } from './src/theme';

type Route =
  | { name: 'onboarding' }
  | { name: 'profiling' }
  | { name: 'bilan' }
  | { name: 'lever'; leverId: string }
  | { name: 'module'; moduleId: string }
  | { name: 'library' }
  | { name: 'checklist' }
  | { name: 'paywall' }
  | { name: 'settings' };

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'onboarding' });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [premium, setPremium] = useState(false);
  const [progression, setProgression] = useState<Store.Progression>({});

  useEffect(() => {
    (async () => {
      const [d, p, prem, prog] = await Promise.all([
        loadData(), Store.loadProfile(), Store.loadPremium(), Store.loadProgression(),
      ]);
      setData(d); setProfile(p); setPremium(prem); setProgression(prog);
      setRoute({ name: p ? 'bilan' : 'onboarding' });
    })();
  }, []);

  const go = useCallback((r: Route) => setRoute(r), []);

  if (!data) {
    return (
      <SafeAreaView style={[s.flex, s.center, { backgroundColor: C.bg }]}>
        <Text style={{ fontSize: 56 }}>🧭</Text>
        <ActivityIndicator color={C.green} />
      </SafeAreaView>
    );
  }

  const common = { data, go, profile, setProfile, premium, setPremium, progression, setProgression };
  return (
    <SafeAreaView style={[s.flex, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.green} />
      {route.name === 'onboarding' && <Onboarding {...common} />}
      {route.name === 'profiling' && <Profiling {...common} />}
      {route.name === 'bilan' && <Bilan {...common} />}
      {route.name === 'lever' && <LeverDetail {...common} leverId={route.leverId} />}
      {route.name === 'module' && <ModuleScreen {...common} moduleId={route.moduleId} />}
      {route.name === 'library' && <Library {...common} />}
      {route.name === 'checklist' && <Checklist {...common} />}
      {route.name === 'paywall' && <Paywall {...common} />}
      {route.name === 'settings' && <Settings {...common} />}
    </SafeAreaView>
  );
}

interface P {
  data: AppData;
  go: (r: Route) => void;
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  premium: boolean;
  setPremium: (v: boolean) => void;
  progression: Store.Progression;
  setProgression: (p: Store.Progression) => void;
}

// ── Composants ───────────────────────────────────────────────────────────────
const Legal = () => <Text style={s.legal}>⚖️ {BANDEAU_LEGAL}</Text>;
const Tag = ({ c }: { c: string }) => (
  <View style={[s.tag, { backgroundColor: TAGS[c].bg }]}>
    <Text style={[s.tagTxt, { color: TAGS[c].fg }]}>{TAGS[c].emoji} {TAGS[c].label}</Text>
  </View>
);
function Topbar({ title, back, go }: { title: string; back?: Route; go: (r: Route) => void }) {
  return (
    <View style={s.topbar}>
      {back ? <Pressable onPress={() => go(back)} style={s.iconBtn}><Text style={s.iconTxt}>←</Text></Pressable> : <View style={s.iconBtn} />}
      <Text style={s.topTitle}>{title}</Text>
      <Pressable onPress={() => go({ name: 'settings' })} style={s.iconBtn}><Text style={s.iconTxt}>⚙️</Text></Pressable>
    </View>
  );
}
function Badge({ data }: { data: AppData }) {
  const { texte, alerte } = badgeFraicheur(data.fiscalParams, data.veille);
  return (
    <View style={s.freshness}>
      <Text style={s.freshTxt}>📅 {texte} · v{data.fiscalParams.version}</Text>
      {alerte ? <Text style={s.freshAlert}>⚠️ {alerte}</Text> : null}
    </View>
  );
}
function Tabbar({ active, go }: { active: string; go: (r: Route) => void }) {
  const tabs: [Route, string, string][] = [
    [{ name: 'bilan' }, '🎯', 'Bilan'], [{ name: 'library' }, '📚', 'Apprendre'],
    [{ name: 'checklist' }, '✓', 'Actions'], [{ name: 'settings' }, '⚙️', 'Réglages'],
  ];
  return (
    <View style={s.tabbar}>
      {tabs.map(([r, e, l]) => (
        <Pressable key={l} style={s.tab} onPress={() => go(r)}>
          <Text style={{ fontSize: 20 }}>{e}</Text>
          <Text style={[s.tabTxt, active === r.name && { color: C.green }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Écrans ───────────────────────────────────────────────────────────────────
function Onboarding({ go, profile }: P) {
  return (
    <View style={[s.flex, s.center, { padding: 28 }]}>
      <Text style={{ fontSize: 72 }}>🧭</Text>
      <Text style={s.brand}>Boussole</Text>
      <Text style={s.tagline}>Réduis tes impôts <Text style={{ color: C.green, fontWeight: '800' }}>sans dépenser un euro de plus</Text>.</Text>
      <Text style={s.sub}>Un bilan d'orientation fiscale & budgétaire en 15 questions. On t'explique ce qui te revient déjà — on ne te vend rien.</Text>
      <Pressable style={s.btnPrimary} onPress={() => go({ name: 'profiling' })}><Text style={s.btnPrimaryTxt}>Commencer mon bilan</Text></Pressable>
      {profile ? <Pressable style={s.btnGhost} onPress={() => go({ name: 'bilan' })}><Text style={s.btnGhostTxt}>Revoir mon bilan</Text></Pressable> : null}
      <Legal />
    </View>
  );
}

function Profiling({ go, setProfile }: P) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Partial<UserProfile>>({});
  const Q = QUESTIONS[step];
  const pick = async (v: string | number) => {
    const next = { ...draft, [Q.field]: Q.field === 'nbCharges' ? Number(v) : v } as Partial<UserProfile>;
    setDraft(next);
    if (step < QUESTIONS.length - 1) setStep(step + 1);
    else {
      const full = { ...next, filtreZeroDepense: true } as UserProfile;
      await Store.saveProfile(full);
      setProfile(full);
      go({ name: 'bilan' });
    }
  };
  return (
    <View style={s.flex}>
      <View style={s.progress}><View style={[s.progressBar, { width: `${(step / QUESTIONS.length) * 100}%` }]} /></View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={s.stepCount}>Question {step + 1} / {QUESTIONS.length}</Text>
        <Text style={s.qTitle}>{Q.q}</Text>
        {Q.opts.map(([v, l]) => (
          <Pressable key={String(v)} style={[s.option, draft[Q.field] === (Q.field === 'nbCharges' ? Number(v) : v) && s.optionSel]} onPress={() => pick(v)}>
            <Text style={s.optionTxt}>{l}</Text>
          </Pressable>
        ))}
        {step > 0 ? <Pressable style={[s.btnGhost, { marginTop: 16, alignSelf: 'flex-start', paddingHorizontal: 18 }]} onPress={() => setStep(step - 1)}><Text style={s.btnGhostTxt}>← Retour</Text></Pressable> : null}
      </ScrollView>
    </View>
  );
}

function gainTxt(r: LeverResult, masque: boolean): React.ReactNode {
  if (masque) return <Text style={[s.gain, { color: C.gold, fontSize: 15 }]}>🔒 Gain estimé — Premium</Text>;
  if (r.gainEstimeEuros !== null) return <Text style={s.gain}>≈ {Math.round(r.gainEstimeEuros).toLocaleString('fr-FR')} € <Text style={s.gainNote}>/ an (estimation)</Text></Text>;
  return <Text style={[s.gain, { fontSize: 14, color: C.inkMute }]}>Gain à estimer selon ta situation</Text>;
}

function LeverCard({ lever, result, surveillance, masque, go }: { lever: Lever; result: LeverResult; surveillance?: Surveillance; masque: boolean; go: (r: Route) => void }) {
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Tag c={result.coutNet} />
        {surveillance ? <Text style={s.veilleChip}>⚠️ Susceptible d'évoluer ({surveillance.horizon})</Text> : null}
      </View>
      <Text style={s.cardTitle}>{lever.titre}</Text>
      <Text style={s.cardCalc}>{result.texteCalcul}</Text>
      {result.avertissement ? <Text style={s.warn}>⚠️ {result.avertissement}</Text> : null}
      {gainTxt(result, masque)}
      <View style={[s.row, { marginTop: 12 }]}>
        <Pressable style={s.btnSmall} onPress={() => go({ name: 'module', moduleId: lever.moduleId })}><Text style={s.btnSmallTxt}>Apprendre (60 s)</Text></Pressable>
        <Pressable style={[s.btnSmall, s.btnSmallGhost]} onPress={() => go({ name: 'lever', leverId: lever.id })}><Text style={[s.btnSmallTxt, { color: C.inkSoft }]}>Où agir</Text></Pressable>
      </View>
    </View>
  );
}

function Bilan({ data, go, profile, setProfile, premium }: P) {
  if (!profile) return <Onboarding {...({ data, go, profile, setProfile } as P)} />;
  const out = orienter(profile, data.fiscalParams, data.veille);
  const tmi = estimeTMI(profile);
  const toggleFiltre = async () => {
    const np = { ...profile, filtreZeroDepense: !profile.filtreZeroDepense };
    await Store.saveProfile(np); setProfile(np);
  };
  return (
    <View style={s.flex}>
      <Topbar title="Ton bilan" go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Badge data={data} />
        <View style={s.filterRow}>
          <Pressable onPress={toggleFiltre} style={[s.switch, profile.filtreZeroDepense && { backgroundColor: C.green }]}>
            <View style={[s.knob, profile.filtreZeroDepense && { transform: [{ translateX: 20 }] }]} />
          </Pressable>
          <Text style={s.filterTxt}>Filtre « Zéro dépense » {profile.filtreZeroDepense ? '(actif : 🟢 🔵)' : '(inactif : 🟠 affichés)'}</Text>
        </View>
        <Text style={s.tmiLine}>Tranche marginale estimée : {Math.round(tmi * 100)} %</Text>
        {out.encartPro ? <Text style={s.encartPro}>🧑‍⚖️ Situation particulière détectée. Consulte un professionnel (notaire / CGP / expert-comptable). On ne simule pas ce cas.</Text> : null}
        {out.bannieres.map((b, i) => <Text key={i} style={s.banniere}>💡 {b}</Text>)}
        {out.leviers.length === 0 ? (
          <Text style={s.empty}>Aucun levier « zéro dépense » ne ressort. Désactive le filtre ou explore la bibliothèque.</Text>
        ) : out.leviers.map((it, idx) => (
          <LeverCard key={it.lever.id} lever={it.lever} result={it.result} surveillance={it.surveillance} masque={!premium && idx >= 3} go={go} />
        ))}
        {!premium && out.leviers.length > 3 ? <Pressable style={s.btnPrimary} onPress={() => go({ name: 'paywall' })}><Text style={s.btnPrimaryTxt}>Débloquer tous les leviers chiffrés</Text></Pressable> : null}
        <Legal />
      </ScrollView>
      <Tabbar active="bilan" go={go} />
    </View>
  );
}

function LeverDetail({ data, go, profile, leverId }: P & { leverId: string }) {
  const lever = CATALOGUE.find((l) => l.id === leverId);
  if (!lever || !profile) return <Bilan {...({ data, go, profile } as P)} />;
  const result = lever.calcule(profile, data.fiscalParams);
  const surv = (data.veille.surveillances || []).find((sv) => (sv.leviers || []).includes(lever.id));
  return (
    <View style={s.flex}>
      <Topbar title={lever.titre} back={{ name: 'bilan' }} go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Tag c={result.coutNet} />
        <View style={s.calcBox}>
          <Text style={s.calcLabel}>CALCUL ILLUSTRATIF</Text>
          <Text style={s.calcP}>{result.texteCalcul}</Text>
          <Text style={s.calcSmall}>Estimation, à vérifier sur impots.gouv.fr.</Text>
        </View>
        {result.avertissement ? <Text style={s.warn}>⚠️ {result.avertissement}</Text> : null}
        {surv ? <View style={s.veilleBox}><Text style={s.veilleBoxTxt}>⚠️ Règle susceptible d'évoluer ({surv.horizon}). {surv.nature_risque}</Text></View> : null}
        <Text style={s.sectionH}>Où agir</Text>
        {lever.ouAgir.map((a, i) => <Text key={i} style={s.li}>• {a}</Text>)}
        <Text style={s.sectionH}>Sources</Text>
        <Text style={s.sources}>{lever.sources.join(' · ')}</Text>
        <Pressable style={s.btnPrimary} onPress={() => go({ name: 'module', moduleId: lever.moduleId })}><Text style={s.btnPrimaryTxt}>Apprendre en 60 s</Text></Pressable>
        <Legal />
      </ScrollView>
    </View>
  );
}

function ModuleScreen({ data, go, moduleId, progression, setProgression }: P & { moduleId: string }) {
  const m = data.modules.find((x: any) => x.id === moduleId);
  const [answered, setAnswered] = useState<number | null>(null);
  if (!m) return null;
  const onQuiz = async (i: number) => {
    setAnswered(i);
    const np = { ...progression, [m.id]: { fait: true, quizOk: i === m.quiz.bonneReponse } };
    setProgression(np); await Store.saveProgression(np);
  };
  return (
    <View style={s.flex}>
      <Topbar title="Apprendre" back={{ name: 'library' }} go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Tag c={m.coutNet} />
        <Text style={s.moduleTitle}>{m.titre}</Text>
        <Text style={s.accroche}>{m.accroche}</Text>
        <Section label="EN CLAIR" txt={m.contenu} />
        {m.piege ? <Text style={s.piege}>⚠️ Le piège : {m.piege}</Text> : null}
        <Section label="POUR QUI" txt={m.pourQui} />
        <Section label="LE CALCUL" txt={m.calcul} />
        <View style={s.moduleSection}>
          <Text style={s.msLabel}>OÙ AGIR</Text>
          {m.ouAgir.map((a: string, i: number) => <Text key={i} style={s.li}>• {a}</Text>)}
        </View>
        <Text style={s.sources}>{m.sources.join(' · ')}</Text>
        <View style={s.quiz}>
          <Text style={s.quizQ}>{m.quiz.question}</Text>
          {m.quiz.options.map((o: string, i: number) => (
            <Pressable key={i} disabled={answered !== null}
              style={[s.quizOpt, answered !== null && i === m.quiz.bonneReponse && s.quizOk, answered === i && i !== m.quiz.bonneReponse && s.quizBad]}
              onPress={() => onQuiz(i)}>
              <Text style={s.quizOptTxt}>{o}</Text>
            </Pressable>
          ))}
          {answered !== null ? <Text style={s.quizExplain}>{m.quiz.explication}</Text> : null}
        </View>
        <Legal />
      </ScrollView>
    </View>
  );
}
const Section = ({ label, txt }: { label: string; txt: string }) => (
  <View style={s.moduleSection}><Text style={s.msLabel}>{label}</Text><Text style={s.msP}>{txt}</Text></View>
);

function Library({ data, go, progression }: P) {
  const mods = [...data.modules].sort((a: any, b: any) => a.ordre - b.ordre);
  return (
    <View style={s.flex}>
      <Topbar title="Bibliothèque" go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Badge data={data} />
        <Text style={s.libIntro}>Modules de 60 s. Le socle (0–5) est gratuit et hors-ligne. La bibliothèque avancée arrive en Premium.</Text>
        {mods.map((m: any) => (
          <Pressable key={m.id} style={s.card} onPress={() => go({ name: 'module', moduleId: m.id })}>
            <View style={s.row}><Tag c={m.coutNet} />{progression[m.id]?.fait ? <Text style={{ color: C.green, fontWeight: '800' }}>✓</Text> : null}</View>
            <Text style={s.cardTitle}>{m.titre}</Text>
            <Text style={s.cardCalc}>{m.accroche}</Text>
          </Pressable>
        ))}
        <Pressable style={[s.card, { borderStyle: 'dashed' }]} onPress={() => go({ name: 'paywall' })}>
          <Text style={{ fontSize: 22 }}>🔒</Text>
          <Text style={s.cardTitle}>Modules avancés 6–10</Text>
          <Text style={s.cardCalc}>PER, assurance-vie, PEA, barème km, rénovation. Premium.</Text>
        </Pressable>
        <Legal />
      </ScrollView>
      <Tabbar active="library" go={go} />
    </View>
  );
}

function Checklist({ data, go, profile, premium }: P) {
  if (!premium) return <Paywall {...({ data, go, profile, premium } as P)} />;
  const out = profile ? orienter(profile, data.fiscalParams, data.veille) : { leviers: [] as any[] };
  return (
    <View style={s.flex}>
      <Topbar title="Ma checklist" go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionH}>À faire pour mon profil</Text>
        {out.leviers.flatMap((it: any) => it.lever.ouAgir.map((a: string) => `${it.lever.titre} — ${a}`)).map((t: string, i: number) => (
          <Text key={i} style={s.li}>☐ {t}</Text>
        ))}
        <Text style={s.sectionH}>Rappels saisonniers</Text>
        <Text style={s.li}>📅 Avril–juin : vérifie tes crédits/réductions (campagne de déclaration).</Text>
        <Text style={s.li}>📅 31 décembre : dernier moment pour verser sur PER/PEE au titre de l'année.</Text>
        <Legal />
      </ScrollView>
      <Tabbar active="checklist" go={go} />
    </View>
  );
}

function Paywall({ go, setPremium }: P) {
  return (
    <View style={s.flex}>
      <Topbar title="Premium" back={{ name: 'bilan' }} go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={{ fontSize: 48, textAlign: 'center' }}>🔓</Text>
        <Text style={[s.moduleTitle, { textAlign: 'center' }]}>Passe à Boussole Premium</Text>
        <Text style={s.sub}>Tous les leviers chiffrés, la bibliothèque complète, les simulations, la checklist et les rappels saisonniers.</Text>
        <Pressable style={s.btnPrimary} onPress={async () => { await Store.savePremium(true); setPremium(true); go({ name: 'bilan' }); }}>
          <Text style={s.btnPrimaryTxt}>Activer Premium (démo)</Text>
        </Pressable>
        <Text style={s.paywallNote}>Intégration RevenueCat prévue (mensuel + annuel, grace period / billing retry). Ici : bascule de démonstration locale.</Text>
        <Legal />
      </ScrollView>
    </View>
  );
}

function Settings({ data, go, setProfile, premium, setPremium }: P) {
  const fp = data.fiscalParams;
  return (
    <View style={s.flex}>
      <Topbar title="Réglages" go={go} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Badge data={data} />
        <Pressable style={s.setRow} onPress={async () => { await Store.saveProfile(null as any); setProfile(null); go({ name: 'profiling' }); }}><Text style={s.setRowTxt}>🔄 Refaire mon profil</Text></Pressable>
        <Pressable style={s.setRow} onPress={async () => { const v = !premium; await Store.savePremium(v); setPremium(v); }}><Text style={s.setRowTxt}>{premium ? '⭐ Premium actif — désactiver' : '🔒 Activer Premium (démo)'}</Text></Pressable>
        <Text style={s.sectionH}>Sources & données fiscales</Text>
        <Text style={s.setMeta}>{fp.cadre_legal}{'\n'}Revenus {fp.annee_revenus} · déclaration {fp.annee_declaration}{'\n'}Version {fp.version} · maj {fp.date_maj} · source {data.source}</Text>
        <Text style={s.setMeta}>Sources : Légifrance, BOFiP, service-public.fr, impots.gouv.fr, Urssaf, mesdroitssociaux.gouv.fr.</Text>
        <Text style={s.sectionH}>Surveillance fiscale</Text>
        {(data.veille.surveillances || []).map((sv) => <Text key={sv.parametre} style={s.setMeta}>• {sv.parametre} — {sv.statut_actuel} ({sv.probabilite_evolution}, {sv.horizon})</Text>)}
        <Text style={s.sectionH}>Données</Text>
        <Text style={s.setMeta}>Stockées localement (profil + progression). Aucune donnée bancaire, aucun compte, aucun tracking.</Text>
        <Legal />
      </ScrollView>
      <Tabbar active="settings" go={go} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 90, gap: 14 },
  topbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.green, paddingHorizontal: 10, paddingVertical: 12 },
  topTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: '#fff', fontSize: 18 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabTxt: { fontSize: 11, fontWeight: '600', color: C.inkMute },
  brand: { fontSize: 40, fontWeight: '800', color: C.green, marginTop: 8 },
  tagline: { fontSize: 18, textAlign: 'center', marginTop: 10, color: C.ink },
  sub: { fontSize: 14, color: C.inkSoft, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  btnPrimary: { backgroundColor: C.green, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, padding: 13, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  btnGhostTxt: { color: C.green, fontWeight: '600' },
  legal: { fontSize: 12, color: C.inkMute, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginTop: 8 },
  freshness: { backgroundColor: C.greenLight, borderRadius: 10, padding: 8 },
  freshTxt: { fontSize: 12.5, color: C.greenDark },
  freshAlert: { fontSize: 12.5, color: C.orange, fontWeight: '600', marginTop: 4 },
  progress: { height: 6, backgroundColor: C.border },
  progressBar: { height: 6, backgroundColor: C.green },
  stepCount: { fontSize: 13, fontWeight: '700', color: C.gold, letterSpacing: 0.5 },
  qTitle: { fontSize: 24, fontWeight: '700', marginTop: 8, marginBottom: 16, color: C.ink },
  option: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  optionSel: { borderColor: C.green, backgroundColor: C.greenLight },
  optionTxt: { fontSize: 16, fontWeight: '600', color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, gap: 6 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  cardCalc: { fontSize: 14, color: C.inkSoft },
  warn: { fontSize: 13, color: C.orange },
  gain: { fontSize: 22, fontWeight: '800', color: C.green, marginTop: 6 },
  gainNote: { fontSize: 12, fontWeight: '500', color: C.inkMute },
  tag: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt: { fontSize: 12, fontWeight: '700' },
  veilleChip: { fontSize: 11, fontWeight: '600', color: C.orange, backgroundColor: '#FBEEE2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16 },
  btnSmall: { backgroundColor: C.greenLight, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnSmallGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.border },
  btnSmallTxt: { color: C.greenDark, fontWeight: '700', fontSize: 14 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  filterTxt: { flex: 1, fontSize: 14, color: C.ink },
  switch: { width: 48, height: 28, borderRadius: 28, backgroundColor: '#c9cfca', padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  tmiLine: { fontSize: 14, color: C.inkSoft },
  encartPro: { backgroundColor: '#FFF6E6', borderWidth: 1, borderColor: C.gold, borderRadius: 16, padding: 14, fontSize: 14 },
  banniere: { backgroundColor: C.greenLight, borderRadius: 12, padding: 12, fontSize: 14, color: C.greenDark },
  empty: { color: C.inkMute, textAlign: 'center', padding: 24 },
  calcBox: { backgroundColor: C.greenLight, borderRadius: 16, padding: 16 },
  calcLabel: { fontSize: 12, fontWeight: '700', color: C.greenDark, letterSpacing: 0.5 },
  calcP: { fontSize: 15, color: C.greenDark, marginTop: 8 },
  calcSmall: { fontSize: 12, color: C.greenDark, opacity: 0.8, marginTop: 6 },
  veilleBox: { backgroundColor: '#FBEEE2', borderWidth: 1, borderColor: C.orange, borderRadius: 16, padding: 14 },
  veilleBoxTxt: { fontSize: 14, color: '#7a3c10' },
  sectionH: { fontSize: 16, fontWeight: '700', color: C.greenDark, marginTop: 4 },
  li: { fontSize: 15, color: C.ink, marginVertical: 2 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', fontSize: 12, color: C.inkSoft },
  moduleTitle: { fontSize: 24, fontWeight: '700', color: C.ink },
  accroche: { fontSize: 17, fontWeight: '500', color: C.ink },
  moduleSection: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  msLabel: { fontSize: 12, fontWeight: '700', color: C.gold, letterSpacing: 0.5 },
  msP: { fontSize: 15, marginTop: 6, color: C.ink },
  piege: { backgroundColor: '#FBEEE2', borderRadius: 12, padding: 12, fontSize: 14, color: '#7a3c10' },
  quiz: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  quizQ: { fontWeight: '600', marginBottom: 12, color: C.ink },
  quizOpt: { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  quizOk: { backgroundColor: C.greenLight, borderColor: C.green },
  quizBad: { backgroundColor: '#F8E9DC', borderColor: C.orange },
  quizOptTxt: { fontWeight: '600', color: C.ink },
  quizExplain: { marginTop: 12, fontSize: 14, color: C.inkSoft, backgroundColor: C.surface2, padding: 12, borderRadius: 12 },
  libIntro: { fontSize: 14, color: C.inkSoft },
  paywallNote: { fontSize: 12, color: C.inkMute, textAlign: 'center', marginTop: 8 },
  setRow: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 15 },
  setRowTxt: { fontSize: 15, fontWeight: '600', color: C.ink },
  setMeta: { fontSize: 13, color: C.inkSoft, lineHeight: 20 },
});
