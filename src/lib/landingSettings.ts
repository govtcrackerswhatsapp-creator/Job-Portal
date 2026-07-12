import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LandingSettings } from '../types';

export const DEFAULT_LANDING: LandingSettings = {
  brandNameStart: 'Tec',
  brandNameEnd: 'Kosh',
  heroBadge: 'Never miss a job notification again',
  heroHeadline: 'Your gateway to the latest',
  heroHeadlineAccent: 'government & private jobs',
  heroSubtext: 'Get exam details, study material, eligibility, and application dates for every opportunity — all in one place, updated daily.',
  heroCtaText: 'Get Started Free',
  heroImages: [],
  heroImageInterval: 5,
  featuresTitle: 'Everything you need to land your dream job',
  features: [
    { icon: 'bell', title: 'Daily Job Updates', description: 'Fresh government, corporate, and internship notifications added every day.' },
    { icon: 'file-text', title: 'Complete Exam Details', description: 'Full exam patterns, syllabus, and selection process for every listing.' },
    { icon: 'book-open', title: 'Study Material', description: 'Curated resources and preparation tips to help you succeed.' },
    { icon: 'clock', title: 'Never Miss Deadlines', description: 'Clear application windows so you always apply on time.' },
  ],
  footerContactEmail: '',
  footerContactPhone: '',
  footerCopyright: '© 2026 TecKosh. All rights reserved.',
  privacyUrl: '',
  termsUrl: '',
};

// Lightweight in-memory cache: avoids re-reading Firestore on every landing visit.
let cache: { data: LandingSettings; at: number } | null = null;
const CACHE_MS = 2 * 60 * 1000; // 2 minutes

/** Clear the cache — call after an admin saves, so changes show immediately. */
export function clearLandingCache() {
  cache = null;
}

/**
 * Load landing settings, merged over defaults. Uses a 2-min in-memory cache to
 * cut reads. Never throws — returns defaults on error.
 */
export async function loadLandingSettings(force = false): Promise<LandingSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }
  try {
    const snap = await getDoc(doc(db, 'settings', 'landing'));
    const data = snap.exists() ? { ...DEFAULT_LANDING, ...(snap.data() as Partial<LandingSettings>) } : DEFAULT_LANDING;
    cache = { data, at: Date.now() };
    return data;
  } catch (e) {
    console.error('Failed to load landing settings, using defaults.', e);
    return cache?.data ?? DEFAULT_LANDING;
  }
}