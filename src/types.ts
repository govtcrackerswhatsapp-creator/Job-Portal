export type Role = 'superadmin' | 'manager' | 'user';

export type JobCategory = 'government' | 'corporate' | 'internship';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
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

export interface LandingSettings {
  brandNameStart: string;
  brandNameEnd: string;
  heroBadge: string;
  heroHeadline: string;
  heroHeadlineAccent: string;
  heroSubtext: string;
  heroCtaText: string;
  heroImages: string[];
  heroImageInterval: number;
  // Hero display controls
  heroOverlayOpacity: number;   // 0-100 (white overlay strength; lower = image more visible)
  heroBlur: number;             // px of backdrop blur (0 = crisp)
  heroImagePosition: string;    // 'center' | 'top' | 'bottom'
  heroMinHeight: number;        // min hero height in px
  heroPaddingY: number;         // top/bottom padding in px
  featuresTitle: string;
  features: LandingFeature[];
  footerContactEmail: string;
  footerContactPhone: string;
  footerCopyright: string;
  footerLinks: FooterLink[];
  privacyUrl?: string;
  termsUrl?: string;
}