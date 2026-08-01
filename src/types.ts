export type Role = 'superadmin' | 'manager' | 'user';

/**
 * A category id.
 *
 * This used to be a fixed union of four literals. Categories are now managed
 * from the admin panel, so the id is whatever the Firestore document is called
 * in the `categories` collection. The four built-ins keep their original ids
 * ('government', 'corporate', 'internship', 'exam') so every existing job
 * continues to resolve without migration.
 *
 * The id is STABLE and is what a job stores. The display name lives on the
 * category document and can be renamed freely without touching any job — the
 * same discipline PlanTier.id uses for billing periods.
 */
export type JobCategory = string;

export type WorkMode = 'onsite' | 'hybrid' | 'remote';

/**
 * Whether a listing sits behind the paywall.
 *
 * 'auto' (the default, and what every existing job means by omitting the field)
 * derives the answer from the content itself — see isPremiumJob() in lib/access.
 * 'paid' and 'free' are manual overrides for the cases where a human disagrees
 * with the rule.
 */
export type JobAccessTier = 'auto' | 'paid' | 'free';

/**
 * One selectable job category, managed from Admin -> Categories.
 *
 * `color` is a hex string rather than a Tailwind class because Tailwind v4
 * only ships classes it can see in the source at build time — a class name
 * assembled at runtime from Firestore would silently render unstyled. Badges
 * therefore use inline styles, exactly like JobLinkButton and SocialLink.
 */
export interface Category {
  /** Firestore document id. This is the value stored on Job.category. Never changes. */
  id?: string;
  /** Display name. Safe to rename at any time. */
  label: string;
  /** Badge colour as a hex string, e.g. '#10b981'. */
  color: string;
  /** Sort position in the job form and the dashboard filter. */
  order?: number;
  /**
   * Inactive categories are hidden from the job form so nothing new lands in
   * them, but jobs already using them keep working and stay filterable.
   */
  active: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  /** Signup timestamp (ms). Absent on accounts created before this was tracked. */
  createdAt?: number;
  name?: string | null;
  photoURL?: string | null;
  subscriptionStatus?: 'active' | 'inactive';
  subscriptionExpiry?: number | null;
  subscriptionStart?: number | null;
  planName?: string | null;
  contact?: string | null;
  freeAccess?: boolean;
  suspended?: boolean;
}

export interface JobSection {
  title: string;
  content: string;
}

export interface JobLinkButton {
  text: string;
  url: string;
  bgColor: string;
  textColor: string;
}

export interface Job {
  id?: string;
  /** Stable identity used by the bulk importer to match and overwrite instead of duplicating. */
  refCode?: string;
  title: string;
  category: JobCategory;
  ageLimit: string;
  notificationDate: number | null;
  applicationStartDate: number | null;
  applicationEndDate: number | null;
  /**
   * The date of the exam itself, for recruitment decided by an exam.
   *
   * When set, this — not applicationEndDate — decides how long the listing
   * stays live, so a posting whose application window has closed remains
   * visible until the exam is over. Both dates are still displayed truthfully:
   * the card shows "Applications closed - Exam 8 Aug" rather than pretending
   * the application deadline moved.
   *
   * For a multi-stage exam this holds the LAST known stage, so the listing
   * survives until the whole process is done. Leave it null when there is no
   * exam, or when the date has not been announced yet.
   */
  examDate?: number | null;
  educationalQualification: string;
  examDetails?: string;
  studyMaterial?: string;
  customSections?: JobSection[];
  linkButtons?: JobLinkButton[];
  companyName?: string;
  companyLogo?: string;
  salary?: string;
  experience?: string;
  location?: string;
  workMode?: WorkMode | '';
  skills?: string[];

  /**
   * PAYWALL TIER.
   *
   * Absent means 'auto', which is what every job written before this field
   * existed means — so nothing needs migrating.
   *
   * Under 'auto' the lock is decided by the content, not by a setting: a job
   * earns a paywall only when it carries exam details or study material with
   * real substance. Everything else on a listing — title, dates, salary,
   * eligibility, an apply link — is a fact anyone can find on the official
   * notification in one search, so charging for it makes the subscription look
   * like a trick and damages trust in the listings that ARE worth paying for.
   *
   * 'paid' and 'free' exist for the cases where that rule is wrong: a
   * thoroughly researched selection process with no exam pattern deserves
   * 'paid'; a two-line exam mention that would not survive scrutiny deserves
   * 'free'.
   */
  accessTier?: JobAccessTier;

  /**
   * EDITORIAL HOLD.
   *
   * A job whose dates have passed is expired — that is a fact, derived from the
   * calendar, and `isJobExpired()` keeps saying so. Hold is a separate, human
   * decision layered on top: "this listing is finished by the calendar, but I
   * still want it around because the result / interview / counselling is
   * pending."
   *
   * Deliberately NOT wired into isJobExpired(). Expiry stays pure date logic so
   * the derived-lifecycle model never has to argue with a stored status field.
   * Hold only affects which TAB a job files under, and what its card says.
   *
   * Held jobs leave the Expired bucket, so "delete all expired" cannot reach
   * them. That is the whole point of the feature.
   */
  onHold?: boolean;

  /**
   * PUBLIC. Rendered on the job card and detail page in place of the muted
   * "Completed" a past exam date would otherwise produce, e.g. "Result awaited".
   *
   * Required whenever onHold is true — an empty label leaves a blank line where
   * the stage should be, which is worse than the label it replaced. The form
   * enforces it and the importer rejects the row, but getJobStage() still
   * carries a fallback because a document edited directly in the Firebase
   * console can reach the client with this empty.
   */
  holdLabel?: string;

  /** PRIVATE. Admin-only reminder, never shown to users, e.g. "chase SSC helpdesk". */
  holdNote?: string;

  /**
   * When the hold was applied (ms). Stamped automatically, never typed and
   * never importable — it is in the importer's IGNORED_FIELDS alongside
   * createdAt for exactly that reason.
   *
   * Exists so the Hold tab can sort oldest-first and say "held 47 days ago".
   * That is the only thing stopping a hold sitting there forever unnoticed,
   * which is the failure mode a plain boolean flag would have had. Cleared on
   * release, so re-holding a job starts a fresh clock.
   */
  heldAt?: number;
  createdAt: number;
  createdBy: string;
}

/**
 * One selectable billing period on a plan (e.g. "6 months / 180 days / ₹2499").
 * `id` is a stable random slug so reordering or renaming tiers never changes which
 * one a price resolves to. Tiers are OPTIONAL and purely additive: a plan with no
 * `tiers` behaves exactly as before (monthly + optional annual).
 */
export interface PlanTier {
  id: string;
  label: string;
  days: number;
  price: number;
}

export interface SubscriptionPlan {
  id?: string;
  name: string;
  price: number;
  annualPrice?: number | null;
  durationInDays: number;
  features: string[];
  active: boolean;
  details?: string;
  badge?: string;
  icon?: string;
  /**
   * Custom billing periods. When present, the plan card shows these as period
   * chips and the server prices each order by the chosen tier's `id`. The FIRST
   * tier mirrors `price`/`durationInDays` so the landing page and the existing
   * (non-tier) payment path keep working with no migration.
   */
  tiers?: PlanTier[];
}

export interface PaymentRecord {
  id?: string;
  userId: string;
  email: string;
  planId: string;
  planName: string;
  amount: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  status: 'success' | 'failed' | 'pending';
  createdAt: number;
  durationInDays?: number;
  expiryDate?: number;
  contact?: string | null;
}

export interface SocialLink {
  id?: string;
  platform: string;
  icon: string;
  url: string;
  handle?: string;
  description?: string;
  color?: string;
  order?: number;
  enabled: boolean;
}

export type MaintenanceAudience = 'users' | 'users_and_managers';
export type MaintenanceMode = 'manual' | 'onetime' | 'daily';

export interface AppSettings {
  allowManagerAnalytics?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  maintenanceAudience?: MaintenanceAudience;
  maintenanceScheduleMode?: MaintenanceMode;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  maintenanceDailyStartTime?: string;
  maintenanceDailyEndTime?: string;
  maintenanceDailyFrom?: string;
  maintenanceDailyTo?: string;
}

export interface LandingFeature {
  icon: string;
  title: string;
  description: string;
}

export interface FooterLink {
  label: string;
  url: string;
}

export interface Review {
  name: string;
  title: string;
  stars: number;
  text: string;
}

export interface LandingSettings {
  brandNameStart: string;
  brandNameEnd: string;
  brandColorStart: string;
  brandColorEnd: string;
  logoUrl: string;
  logoSizeNav: number;
  logoSizeFooter: number;
  navBgColor: string;
  navTextColor: string;
  signInButtonText: string;
  signInBtnBgColor: string;
  signInBtnTextColor: string;
  heroBadge: string;
  heroHeadline: string;
  heroHeadlineAccent: string;
  heroSubtext: string;
  heroCtaText: string;
  heroImages: string[];
  heroImagesMobile: string[];
  heroImageInterval: number;
  heroOverlayOpacity: number;
  heroBlur: number;
  heroImagePosition: string;
  heroMinHeight: number;
  heroPaddingY: number;
  heroOverlayOpacityMobile: number;
  heroBlurMobile: number;
  heroImagePositionMobile: string;
  heroMinHeightMobile: number;
  heroPaddingYMobile: number;
  featuresTitle: string;
  features: LandingFeature[];
  communityTitle: string;
  communitySubtext: string;
  reviewsTitle: string;
  reviews: Review[];
  footerContactEmail: string;
  footerContactPhone: string;
  footerCopyright: string;
  footerLinks: FooterLink[];
  privacyUrl?: string;
  termsUrl?: string;
}