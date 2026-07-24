export type Role = 'superadmin' | 'manager' | 'user';

export type JobCategory = 'government' | 'corporate' | 'internship' | 'exam';

export type WorkMode = 'onsite' | 'hybrid' | 'remote';

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
  title: string;
  category: JobCategory;
  ageLimit: string;
  notificationDate: number | null;
  applicationStartDate: number | null;
  applicationEndDate: number | null;
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
  createdAt: number;
  createdBy: string;
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