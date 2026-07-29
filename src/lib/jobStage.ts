import { Job } from '../types';
import { formatDate } from './format';

/**
 * Job lifecycle: how long a listing stays live, and what it says while it does.
 *
 * THE RULE: a job stays live until its examDate when one is set, otherwise
 * until its applicationEndDate. Both are inclusive of the whole day.
 *
 * This exists because applicationEndDate was doing two different jobs — the
 * deadline to apply (a fact belonging to the student) and how long the listing
 * stays useful (an editorial decision belonging to the admin). For a corporate
 * posting those coincide. For an exam they are months apart, which forced
 * admins to type the exam date into the application field to keep a listing
 * alive, telling students they could still apply when they could not.
 *
 * Separating them means both dates stay truthful and the card reports the real
 * position: "Applications closed - Exam 8 Aug".
 *
 * HOLD sits on top of all of this without disturbing it. isJobExpired() stays
 * pure date logic — a held job whose dates have passed is still expired, and
 * still says so. Hold only decides which tab it files under (ManageJobs) and
 * what the card says (getJobStage). Keeping the two separate is what stops a
 * stored status field from ever contradicting the derived one.
 *
 * Nothing here is stored. Every value is derived from the dates at read time,
 * so a listing moves through its stages on its own as the calendar advances —
 * no status field, no cron, no admin having to remember to update anything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

/** Applications closing within this many days are flagged as urgent. */
const URGENT_DAYS = 7;

/**
 * Dates are stored at local midnight, so a date is not "past" until the NEXT
 * midnight — a job stays live for the whole of its final day. This mirrors the
 * original isExpired() in ManageJobs exactly; changing it would silently retire
 * every listing a day early.
 */
function isDayPast(dateMs: number, now: number): boolean {
  return dateMs + DAY_MS <= now;
}

/** Whole days remaining, counting the target day itself. 1 means "today is the last day". */
function daysUntil(dateMs: number, now: number): number {
  return Math.max(0, Math.ceil((dateMs + DAY_MS - now) / DAY_MS));
}

/** Compact date for the card: "8 Aug", or "8 Aug 2027" when it is not this year. */
function shortDate(ms: number, now: number): string {
  try {
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString(
      'en-IN',
      sameYear
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' },
    );
  } catch {
    return formatDate(ms);
  }
}

/**
 * The date that decides how long this listing lives: the exam date when set,
 * otherwise the application deadline. Null when the job carries neither, in
 * which case expiry falls back to the job's age.
 */
export function lifecycleEndDate(job: Pick<Job, 'examDate' | 'applicationEndDate'>): number | null {
  if (job.examDate) return job.examDate;
  if (job.applicationEndDate) return job.applicationEndDate;
  return null;
}

/**
 * Is this listing past its life?
 *
 * THE single source of truth for expiry — Manage Jobs' Active/Expired tabs and
 * the stage shown on the card both come through here, so they can never
 * disagree about a given job.
 *
 * DELIBERATELY IGNORES onHold. A held job whose dates have passed IS expired —
 * that is a fact about the calendar. Hold is an editorial decision layered on
 * top by the caller, which is why Manage Jobs routes on `job.onHold` FIRST and
 * only then falls through to this function. Wiring hold in here would make a
 * stored flag able to contradict derived date logic, which is exactly the
 * confusion this module was built to prevent.
 *
 * The 30-day age fallback is deliberately preserved from the original
 * implementation: without it, jobs carrying no dates at all would become
 * permanently active and never surface for cleanup.
 */
export function isJobExpired(job: Job, now: number = Date.now()): boolean {
  const end = lifecycleEndDate(job);
  if (end != null) return isDayPast(end, now);
  return job.createdAt < now - THIRTY_DAYS_MS;
}

export type JobStageKind =
  | 'on-hold'       // held open by an admin decision, regardless of dates
  | 'upcoming'      // application window has not opened yet
  | 'open'          // applications open, comfortably far from the deadline
  | 'closing-soon'  // applications open, deadline within URGENT_DAYS
  | 'exam-ahead'    // applications closed (or never dated) with an exam still to come
  | 'closed'        // applications closed, no exam date — the listing is finished
  | 'completed'     // the exam date has passed
  | 'none';         // no dates at all

export interface JobStage {
  kind: JobStageKind;
  /** Ready to render, e.g. "Applications closed · Exam 8 Aug". Empty for 'none'. */
  label: string;
  /** Styling hint so callers never re-derive the logic to pick a colour. */
  tone: 'neutral' | 'positive' | 'urgent' | 'muted';
  /** Always agrees with isJobExpired() — it is computed by calling it. */
  expired: boolean;
  /** Days remaining against whichever date the stage refers to. Null when not meaningful. */
  daysLeft: number | null;
}

/**
 * Shown when a job is held but carries no label.
 *
 * The form requires a label and the importer rejects a row without one, so this
 * should be unreachable through the app. It exists because a document edited
 * directly in the Firebase console can still arrive here with holdLabel empty,
 * and the alternative is an empty string — which renders as a blank line where
 * the stage used to be. A blank line is worse than the "Completed" it replaced.
 */
export const HOLD_FALLBACK_LABEL = 'Update awaited';

/**
 * Where this listing sits on its own timeline, as a label ready to render.
 *
 * Public on the card by design. A free user seeing "Applications closed" with
 * no exam date reads the listing as dead and leaves; seeing "Applications
 * closed - Exam 8 Aug" reads it as still worth paying for. The date is the
 * hook — the exam pattern, study material and official links behind it are
 * still the product.
 */
export function getJobStage(job: Job, now: number = Date.now()): JobStage {
  const start = job.applicationStartDate;
  const end = job.applicationEndDate;
  const exam = job.examDate;

  // Computed once here so every branch below reports the same answer the
  // Active/Expired tabs do.
  const expired = isJobExpired(job, now);

  // EDITORIAL HOLD — checked before every date branch, because that is the
  // entire point: an admin has decided this listing stays useful even though
  // the calendar disagrees. Without this branch first, a held job whose exam
  // has passed would fall through to 'completed' and render a muted grey
  // "Completed", which reads as dead — the exact thing hold exists to fix.
  //
  // `expired` is still reported honestly from isJobExpired(), so the invariant
  // documented on JobStage holds: stage.expired always agrees with
  // isJobExpired(). Hold changes which TAB a job files under and what its card
  // says; it does not change whether the dates have passed.
  if (job.onHold) {
    return {
      kind: 'on-hold',
      label: (job.holdLabel || '').trim() || HOLD_FALLBACK_LABEL,
      // Neutral, never muted. Muted is the grey used for finished listings, and
      // a held job is the opposite of finished.
      tone: 'neutral',
      expired,
      // No countdown: a hold has no end date by design. The Hold tab surfaces
      // age instead, via heldAt.
      daysLeft: null,
    };
  }

  // The exam is over, so the whole process is finished.
  if (exam && isDayPast(exam, now)) {
    return { kind: 'completed', label: 'Completed', tone: 'muted', expired, daysLeft: null };
  }

  // Applications have closed. This is the case examDate exists for.
  if (end && isDayPast(end, now)) {
    if (exam) {
      return {
        kind: 'exam-ahead',
        label: `Applications closed · Exam ${shortDate(exam, now)}`,
        tone: 'neutral',
        expired,
        daysLeft: daysUntil(exam, now),
      };
    }
    return { kind: 'closed', label: 'Applications closed', tone: 'muted', expired, daysLeft: null };
  }

  // The window has not opened yet. Only 16 of the current listings carry a
  // start date, so most jobs skip straight past this branch.
  if (start && now < start) {
    return {
      kind: 'upcoming',
      label: `Opens ${shortDate(start, now)}`,
      tone: 'positive',
      expired,
      daysLeft: daysUntil(start, now),
    };
  }

  // Applications are open.
  if (end) {
    const left = daysUntil(end, now);
    if (left <= URGENT_DAYS) {
      return {
        kind: 'closing-soon',
        label: left <= 1 ? 'Last day to apply' : `${left} days left to apply`,
        tone: 'urgent',
        expired,
        daysLeft: left,
      };
    }
    return {
      kind: 'open',
      label: `Apply by ${shortDate(end, now)}`,
      tone: 'neutral',
      expired,
      daysLeft: left,
    };
  }

  // No application deadline, but an exam is scheduled — lead with that.
  if (exam) {
    return {
      kind: 'exam-ahead',
      label: `Exam ${shortDate(exam, now)}`,
      tone: 'neutral',
      expired,
      daysLeft: daysUntil(exam, now),
    };
  }

  // Nothing dated at all. Expiry here comes from the 30-day age rule.
  return { kind: 'none', label: '', tone: 'muted', expired, daysLeft: null };
}

/** Tailwind text colours per tone. Static strings so Tailwind can see them at build time. */
export const STAGE_TEXT_CLASS: Record<JobStage['tone'], string> = {
  neutral: 'text-zinc-500',
  positive: 'text-emerald-600',
  urgent: 'text-orange-600',
  muted: 'text-zinc-400',
};