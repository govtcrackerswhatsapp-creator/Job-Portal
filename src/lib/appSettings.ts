import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { AppSettings } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  allowManagerAnalytics: false,
  maintenanceMode: false,
  maintenanceMessage: "We're doing some quick maintenance and will be back shortly. Thanks for your patience!",
  maintenanceAudience: 'users',
  maintenanceScheduleMode: 'manual',
  maintenanceStart: '',
  maintenanceEnd: '',
  maintenanceDailyStartTime: '',
  maintenanceDailyEndTime: '',
  maintenanceDailyFrom: '',
  maintenanceDailyTo: '',
};

const KEY = 'appSettings';
const TTL = 2 * 60 * 1000; // 2 minutes

/** Load global app settings, merged over defaults, cached 2 min. Never throws. */
export async function loadAppSettings(force = false): Promise<AppSettings> {
  if (!force) {
    const cached = cacheGet<AppSettings>(KEY, TTL);
    if (cached) return cached;
  }
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    const data = snap.exists() ? { ...DEFAULT_APP_SETTINGS, ...(snap.data() as Partial<AppSettings>) } : DEFAULT_APP_SETTINGS;
    cacheSet(KEY, data);
    return data;
  } catch (e) {
    console.error('Failed to load app settings, using defaults.', e);
    return DEFAULT_APP_SETTINGS;
  }
}

/** Clear the app-settings cache — call after admin saves. */
export function clearAppSettingsCache(): void {
  cacheClear(KEY);
}