import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LandingSettings, FooterLink } from '../types';

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
  heroOverlayOpacity: 40,   // lighter than before, so images show clearly
  heroBlur: 0,              // crisp by default
  heroImagePosition: 'center',
  heroMinHeight: 520,
  heroPaddingY: 64,
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
  footerLinks: [],
};

let cache: { data: LandingSettings; at: number } | null = null;
const CACHE_MS = 2 * 60 * 1000;

export function clearLandingCache() { cache = null; }

export async function loadLandingSettings(force = false): Promise<LandingSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const snap = await getDoc(doc(db, 'settings', 'landing'));
    let data: LandingSettings = snap.exists()
      ? { ...DEFAULT_LANDING, ...(snap.data() as Partial<LandingSettings>) }
      : DEFAULT_LANDING;

    if ((!data.footerLinks || data.footerLinks.length === 0)) {
      const migrated: FooterLink[] = [];
      if (data.privacyUrl) migrated.push({ label: 'Privacy Policy', url: data.privacyUrl });
      if (data.termsUrl) migrated.push({ label: 'Terms of Service', url: data.termsUrl });
      if (migrated.length) data = { ...data, footerLinks: migrated };
    }

    cache = { data, at: Date.now() };
    return data;
  } catch (e) {
    console.error('Failed to load landing settings, using defaults.', e);
    return cache?.data ?? DEFAULT_LANDING;
  }
}