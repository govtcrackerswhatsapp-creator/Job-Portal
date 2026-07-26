import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LandingSettings, FooterLink } from '../types';

/**
 * Landing page settings, with a two-layer cache.
 *
 * WHY localStorage: the hero image URL lives in Firestore, so on a cold load
 * the browser cannot discover it until the JS bundle has downloaded, Firebase
 * has initialised, and a Firestore round trip has returned. The image is the
 * LAST thing in that chain, and because it is a CSS background rather than an
 * <img> tag, the browser's preload scanner cannot see it either.
 *
 * Persisting the settings means every visit after the first knows the hero URL
 * at first paint and can start the download immediately, while a background
 * revalidate keeps the copy fresh. The in-memory layer sits in front because it
 * avoids even the JSON parse within a single session.
 *
 * CRITICAL: cached values are always merged OVER the defaults, never used
 * directly. Without that, the first time a new setting is added to
 * DEFAULT_LANDING everyone holding a cached copy would get `undefined` for it —
 * a blank hero at best, a crash on `.filter()` of an undefined array at worst.
 */

export const DEFAULT_LANDING: LandingSettings = {
  brandNameStart: 'Tec',
  brandNameEnd: 'Kosh',
  brandColorStart: '#18181b',
  brandColorEnd: '#8b2df2',
  logoUrl: '',
  logoSizeNav: 32,
  logoSizeFooter: 28,
  navBgColor: '',
  navTextColor: '',
  signInButtonText: 'Sign in',
  signInBtnBgColor: '',
  signInBtnTextColor: '',
  heroBadge: 'Never miss a job notification again',
  heroHeadline: 'Your gateway to the latest',
  heroHeadlineAccent: 'government & private jobs',
  heroSubtext: 'Get exam details, study material, eligibility, and application dates for every opportunity — all in one place, updated daily.',
  heroCtaText: 'Get Started Free',
  heroImages: [],
  heroImagesMobile: [],
  heroImageInterval: 5,
  heroOverlayOpacity: 40,
  heroBlur: 0,
  heroImagePosition: 'center',
  heroMinHeight: 520,
  heroPaddingY: 64,
  heroOverlayOpacityMobile: 40,
  heroBlurMobile: 0,
  heroImagePositionMobile: 'center',
  heroMinHeightMobile: 520,
  heroPaddingYMobile: 64,
  featuresTitle: 'Everything you need to land your dream job',
  features: [
    { icon: 'bell', title: 'Daily Job Updates', description: 'Fresh government, corporate, and internship notifications added every day.' },
    { icon: 'file-text', title: 'Complete Exam Details', description: 'Full exam patterns, syllabus, and selection process for every listing.' },
    { icon: 'book-open', title: 'Study Material', description: 'Curated resources and preparation tips to help you succeed.' },
    { icon: 'clock', title: 'Never Miss Deadlines', description: 'Clear application windows so you always apply on time.' },
  ],
  communityTitle: 'Join our community',
  communitySubtext: 'Follow us for instant job alerts, preparation tips, and important exam updates.',
  reviewsTitle: 'Trusted by job seekers',
  reviews: [],
  footerContactEmail: '',
  footerContactPhone: '',
  footerCopyright: '© 2026 TecKosh. All rights reserved.',
  footerLinks: [],
};

/**
 * Bump this if the shape ever changes incompatibly. A different key means every
 * browser ignores its stored copy and refetches, with no migration to write.
 */
const STORAGE_KEY = 'teckosh:landing:v1';

let cache: { data: LandingSettings; at: number } | null = null;
const CACHE_MS = 2 * 60 * 1000;

/**
 * Merge over defaults and apply the legacy footer-link migration.
 * Used by BOTH the network path and the localStorage path, so a cached copy
 * behaves identically to a fresh one.
 */
function normalise(raw: Partial<LandingSettings> | null | undefined): LandingSettings {
  let data: LandingSettings = { ...DEFAULT_LANDING, ...(raw || {}) };

  if (!data.footerLinks || data.footerLinks.length === 0) {
    const migrated: FooterLink[] = [];
    if (data.privacyUrl) migrated.push({ label: 'Privacy Policy', url: data.privacyUrl });
    if (data.termsUrl) migrated.push({ label: 'Terms of Service', url: data.termsUrl });
    if (migrated.length) data = { ...data, footerLinks: migrated };
  }

  return data;
}

/** Never throws: storage is unavailable in some privacy modes and inside some webviews. */
function readStorage(): LandingSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalise(parsed as Partial<LandingSettings>);
  } catch {
    // Corrupt or unreadable — drop it so the next load starts clean.
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return null;
  }
}

/** Never throws: Safari private mode raises QuotaExceededError on every write. */
function writeStorage(data: LandingSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore — the in-memory cache still works for this session */
  }
}

/**
 * The best settings available RIGHT NOW, with no awaiting.
 *
 * Call this as the initial value of useState so the first paint already has the
 * hero image URL on repeat visits. Falls back to DEFAULT_LANDING on a genuine
 * first visit, which renders the gradient hero exactly as today.
 */
export function readCachedLandingSettings(): LandingSettings {
  if (cache) return cache.data;
  const stored = readStorage();
  if (stored) {
    // Seed the memory layer but backdate it so the caller's load() still
    // revalidates against the network rather than trusting stale storage.
    cache = { data: stored, at: 0 };
    return stored;
  }
  return DEFAULT_LANDING;
}

/** True when nothing has been cached yet — a genuine cold first visit. */
export function hasCachedLandingSettings(): boolean {
  return cache !== null || readStorage() !== null;
}

export function clearLandingCache(): void {
  cache = null;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Load settings, preferring the in-memory copy inside its TTL.
 *
 * Never throws. On failure it returns whatever is cached, then storage, then
 * the defaults — the landing page must always render something.
 */
export async function loadLandingSettings(force = false): Promise<LandingSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const snap = await getDoc(doc(db, 'settings', 'landing'));
    const data = normalise(snap.exists() ? (snap.data() as Partial<LandingSettings>) : null);
    cache = { data, at: Date.now() };
    writeStorage(data);
    return data;
  } catch (e) {
    console.error('Failed to load landing settings, using cached or default values.', e);
    return cache?.data ?? readStorage() ?? DEFAULT_LANDING;
  }
}