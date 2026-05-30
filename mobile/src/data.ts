// Chargeur de données fiscales (SPEC §3 / §13.4).
// Stratégie : bundlé (import) garanti offline → OTA fetch au démarrage (cache + fallback).
// La source de vérité versionnée est shared/data/*.json (partagée avec la PWA).
import { FiscalParams, VeilleFiscale } from '@shared/engine/types';
import bundledFiscal from '@shared/data/fiscal-params.json';
import bundledVeille from '@shared/data/veille-fiscale.json';
import bundledModules from '@shared/data/modules.json';
import AsyncStorage from '@react-native-async-storage/async-storage';

// URL OTA des JSON hébergés (même fichiers que la PWA). À configurer au déploiement.
const OTA_BASE = 'https://boussole.example.app/shared/data';
const CACHE_KEY = 'boussole.dataCache.v1';

export interface AppData {
  fiscalParams: FiscalParams;
  veille: VeilleFiscale;
  modules: any[];
  source: 'reseau' | 'cache' | 'bundle';
}

const EXPECTED = ['bareme_ir', 'credit_emploi_domicile', 'frais_reels', 'dons', 'epargne_salariale', 'per', 'assurance_vie', 'pea'];
function verifier(fp: any) {
  EXPECTED.forEach((k) => {
    if (!(k in fp)) console.warn(`[data] clé fiscale manquante : ${k}`);
  });
}

const bundle = (): AppData => ({
  fiscalParams: bundledFiscal as unknown as FiscalParams,
  veille: bundledVeille as unknown as VeilleFiscale,
  modules: (bundledModules as any).modules || [],
  source: 'bundle',
});

export async function loadData(): Promise<AppData> {
  try {
    const [fp, ve, mo] = await Promise.all([
      fetch(`${OTA_BASE}/fiscal-params.json`).then((r) => r.json()),
      fetch(`${OTA_BASE}/veille-fiscale.json`).then((r) => r.json()),
      fetch(`${OTA_BASE}/modules.json`).then((r) => r.json()),
    ]);
    verifier(fp);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ fp, ve, mo }));
    return { fiscalParams: fp, veille: ve, modules: mo.modules || [], source: 'reseau' };
  } catch (e) {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { fp, ve, mo } = JSON.parse(cached);
        verifier(fp);
        return { fiscalParams: fp, veille: ve, modules: mo.modules || [], source: 'cache' };
      } catch (_) {
        /* fallback bundle */
      }
    }
    return bundle();
  }
}
