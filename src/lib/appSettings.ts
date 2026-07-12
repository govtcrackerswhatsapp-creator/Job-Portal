import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { AppSettings } from '../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  allowManagerAnalytics: false,
  maintenanceMode: false,
  maintenanceMessage: "We're doing some quick maintenance and will be back shortly. Thanks for your patience!",
};

/** Load global app settings (maintenance, etc.), merged over defaults. Never throws. */
export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) {
      return { ...DEFAULT_APP_SETTINGS, ...(snap.data() as Partial<AppSettings>) };
    }
  } catch (e) {
    console.error('Failed to load app settings, using defaults.', e);
  }
  return DEFAULT_APP_SETTINGS;
}