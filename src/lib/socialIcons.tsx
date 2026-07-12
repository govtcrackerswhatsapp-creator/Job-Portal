import { Instagram, Facebook, Twitter, Youtube, Linkedin, Send, MessageCircle, Globe, Link as LinkIcon, LucideIcon } from 'lucide-react';

export const SOCIAL_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram, facebook: Facebook, twitter: Twitter, youtube: Youtube,
  linkedin: Linkedin, telegram: Send, whatsapp: MessageCircle, globe: Globe,
};

export function socialIconFor(key: string): LucideIcon {
  return SOCIAL_ICONS[key] || LinkIcon;
}

export interface SocialPreset { platform: string; icon: string; color: string; }

export const SOCIAL_PRESETS: SocialPreset[] = [
  { platform: 'Instagram', icon: 'instagram', color: '#E1306C' },
  { platform: 'LinkedIn', icon: 'linkedin', color: '#0A66C2' },
  { platform: 'YouTube', icon: 'youtube', color: '#FF0000' },
  { platform: 'Twitter / X', icon: 'twitter', color: '#000000' },
  { platform: 'WhatsApp', icon: 'whatsapp', color: '#25D366' },
  { platform: 'Facebook', icon: 'facebook', color: '#1877F2' },
  { platform: 'Telegram', icon: 'telegram', color: '#26A5E4' },
  { platform: 'Website', icon: 'globe', color: '#8b2df2' },
];

export const ICON_STYLE_OPTIONS = ['instagram', 'linkedin', 'youtube', 'twitter', 'whatsapp', 'facebook', 'telegram', 'globe'];