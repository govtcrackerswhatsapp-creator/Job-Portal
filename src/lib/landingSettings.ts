import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LandingSettings } from '../types';

// Defaults match the current landing page, so nothing changes until the admin edits.
export const DEFAULT_LANDING: LandingSettings = {
  brandNameStart: 'Tec',
  brandNameEnd: 'Kosh',
  heroBadge: 'Never miss a job notification again',
  heroHeadline: 'Your gateway to the latest',
  heroHeadlineAccent: 'government & private jobs',
  heroSubtext: 'Get exam details, study material, eligibility, and application dates for every opportunity — all in one place, updated daily.',
  heroCtaText: 'Get Started Free',
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

/**
 * Load landing settings from Firestore, merged over defaults so any missing
 * field safely falls back. Never throws — returns defaults on any error.
 */
export async function loadLandingSettings(): Promise<LandingSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'landing'));
    if (snap.exists()) {
      return { ...DEFAULT_LANDING, ...(snap.data() as Partial<LandingSettings>) };
    }
  } catch (e) {
    console.error('Failed to load landing settings, using defaults.', e);
  }
  return DEFAULT_LANDING;
}