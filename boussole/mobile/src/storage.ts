// Stockage local (SPEC §1) — profil + progression sur l'appareil. Pas de compte, pas de
// données bancaires. AsyncStorage (remplaçable par MMKV pour la perf).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '@shared/engine/types';

const K = {
  profile: 'boussole.profile',
  progression: 'boussole.progression',
  premium: 'boussole.premium',
};

export type Progression = Record<string, { fait: boolean; quizOk: boolean }>;

export async function saveProfile(p: UserProfile): Promise<void> {
  await AsyncStorage.setItem(K.profile, JSON.stringify(p));
}
export async function loadProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(K.profile);
  return raw ? (JSON.parse(raw) as UserProfile) : null;
}
export async function saveProgression(p: Progression): Promise<void> {
  await AsyncStorage.setItem(K.progression, JSON.stringify(p));
}
export async function loadProgression(): Promise<Progression> {
  const raw = await AsyncStorage.getItem(K.progression);
  return raw ? (JSON.parse(raw) as Progression) : {};
}
export async function savePremium(v: boolean): Promise<void> {
  await AsyncStorage.setItem(K.premium, JSON.stringify(v));
}
export async function loadPremium(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(K.premium);
  return raw ? (JSON.parse(raw) as boolean) : false;
}
