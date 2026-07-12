import { db } from './firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { SocialLink } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

const KEY = 'social_links';
const TTL = 3 * 60 * 1000; // 3 minutes

/** All social links (sorted by order), cached 3 min. Pass force=true to bypass cache. */
export async function getSocialLinks(force = false): Promise<SocialLink[]> {
  if (!force) {
    const cached = cacheGet<SocialLink[]>(KEY, TTL);
    if (cached) return cached;
  }
  const snap = await getDocs(collection(db, 'social_links'));
  const list: SocialLink[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() as SocialLink) }));
  list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  cacheSet(KEY, list);
  return list;
}

/** Only ENABLED links (for the public landing page), from cache. */
export async function getVisibleSocialLinks(force = false): Promise<SocialLink[]> {
  const all = await getSocialLinks(force);
  return all.filter((l) => l.enabled && l.url && l.platform);
}

export function clearSocialCache(): void {
  cacheClear(KEY);
}

export async function addSocialLink(data: Omit<SocialLink, 'id'>): Promise<void> {
  await addDoc(collection(db, 'social_links'), data as any);
  clearSocialCache();
}

export async function updateSocialLink(id: string, data: Partial<SocialLink>): Promise<void> {
  await updateDoc(doc(db, 'social_links', id), data as any);
  clearSocialCache();
}

export async function deleteSocialLink(id: string): Promise<void> {
  await deleteDoc(doc(db, 'social_links', id));
  clearSocialCache();
}