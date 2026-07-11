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
  notificationDate: string;
  applicationStartDate: string;
  applicationEndDate: string;
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

export interface AppSettings {
  allowManagerAnalytics?: boolean;
}