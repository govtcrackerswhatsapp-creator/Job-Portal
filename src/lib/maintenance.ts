import { AppSettings, Role } from '../types';

/**
 * Get the current time as IST parts, regardless of the user's device timezone.
 * We shift "now" by the IST offset (UTC+5:30) and read UTC fields — giving us
 * the wall-clock time in India no matter where the user is.
 */
function nowInIST(): { year: number; month: number; day: number; minutes: number; dateStr: string } {
  const now = new Date();
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000; // shift to IST
  const ist = new Date(istMs);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1; // 1-12
  const day = ist.getUTCDate();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes(); // minutes since IST midnight
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, minutes, dateStr };
}

/** Parse 'HH:mm' to minutes since midnight. Returns null if invalid. */
function timeToMinutes(t?: string): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Parse 'YYYY-MM-DDTHH:mm' (IST) to a comparable number YYYYMMDDHHmm. Null if invalid. */
function stampToNumber(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(`${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}`);
}

/** Current IST moment as the same comparable number YYYYMMDDHHmm. */
function nowStampNumber(ist: ReturnType<typeof nowInIST>): number {
  const hh = Math.floor(ist.minutes / 60);
  const mm = ist.minutes % 60;
  return Number(
    `${ist.year}${String(ist.month).padStart(2, '0')}${String(ist.day).padStart(2, '0')}${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`
  );
}

/**
 * Is maintenance currently active (based purely on the schedule + IST clock)?
 * Does NOT consider the user — see shouldBlockUser for audience logic.
 */
export function isMaintenanceActiveNow(settings: AppSettings): boolean {
  // Manual switch overrides everything.
  if (settings.maintenanceMode) return true;

  const mode = settings.maintenanceScheduleMode;
  const ist = nowInIST();

  // One-time window: between start and end datetimes (IST).
  if (mode === 'onetime') {
    const start = stampToNumber(settings.maintenanceStart);
    const end = stampToNumber(settings.maintenanceEnd);
    if (start == null || end == null) return false;
    const now = nowStampNumber(ist);
    return now >= start && now < end;
  }

  // Daily recurring: within the date range AND within the daily time window (IST).
  if (mode === 'daily') {
    const from = settings.maintenanceDailyFrom || '';
    const to = settings.maintenanceDailyTo || '';
    // If a date range is set, today must fall within it (inclusive).
    if (from && ist.dateStr < from) return false;
    if (to && ist.dateStr > to) return false;

    const startMin = timeToMinutes(settings.maintenanceDailyStartTime);
    const endMin = timeToMinutes(settings.maintenanceDailyEndTime);
    if (startMin == null || endMin == null) return false;

    const nowMin = ist.minutes;
    if (startMin <= endMin) {
      // Same-day window, e.g. 09:00–17:00.
      return nowMin >= startMin && nowMin < endMin;
    } else {
      // Overnight window, e.g. 23:00–02:00 (wraps past midnight).
      return nowMin >= startMin || nowMin < endMin;
    }
  }

  return false;
}

/**
 * Should THIS user be blocked right now?
 * - Superadmin is ALWAYS exempt (can never be locked out).
 * - Managers are blocked only if audience is 'users_and_managers'.
 * - Regular users are blocked whenever maintenance is active.
 */
export function shouldBlockUser(settings: AppSettings, role: Role | undefined): boolean {
  if (!isMaintenanceActiveNow(settings)) return false;
  if (role === 'superadmin') return false; // safety: never lock out the owner
  if (role === 'manager') return settings.maintenanceAudience === 'users_and_managers';
  return true; // regular users (and anyone else) are blocked
}