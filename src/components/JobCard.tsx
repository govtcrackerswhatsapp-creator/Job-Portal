import { useNavigate } from 'react-router-dom';
import { Job, UserProfile, Category } from '../types';
import { hasPortalAccess } from '../lib/access';
import { workModeLabel, formatDate } from '../lib/format';
import { labelForCategory } from '../lib/categoriesData';
import { getJobStage, STAGE_TEXT_CLASS } from '../lib/jobStage';
import { MapPin, Briefcase, IndianRupee, BadgeCheck, Bookmark, BookmarkCheck, ArrowRight, Loader2, Calendar, Clock, Lock } from 'lucide-react';

// Rotating color themes for cards (by index), matching the reference design.
const THEMES = [
  { grad: 'from-[#8b2df2]/10', ring: '#8b2df2', btn: 'from-[#8b2df2] to-[#a855f7]', tile: 'bg-[#8b2df2]' },
  { grad: 'from-blue-500/10', ring: '#3b82f6', btn: 'from-blue-500 to-blue-600', tile: 'bg-blue-500' },
  { grad: 'from-emerald-500/10', ring: '#10b981', btn: 'from-emerald-500 to-emerald-600', tile: 'bg-emerald-500' },
  { grad: 'from-orange-500/10', ring: '#f97316', btn: 'from-orange-500 to-orange-600', tile: 'bg-orange-500' },
  { grad: 'from-pink-500/10', ring: '#ec4899', btn: 'from-pink-500 to-pink-600', tile: 'bg-pink-500' },
  { grad: 'from-teal-500/10', ring: '#14b8a6', btn: 'from-teal-500 to-teal-600', tile: 'bg-teal-500' },
];

function initials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

interface JobCardProps {
  job: Job;
  index: number;
  user: UserProfile | null;
  isSaved: boolean;
  onToggleSave: (jobId: string) => void;
  savingId: string | null;
  /**
   * Optional so callers that have not loaded categories still render. When it
   * is missing, labelForCategory prettifies the stored id ('government' ->
   * 'Government'), which is correct for every built-in and only diverges once
   * a category has been renamed to something unlike its id.
   */
  categories?: Category[];
}

export default function JobCard({ job, index, user, isSaved, onToggleSave, savingId, categories = [] }: JobCardProps) {
  const navigate = useNavigate();
  const theme = THEMES[index % THEMES.length];
  const company = (job.companyName || '').trim();
  const skills = (job.skills || []).filter((s) => s.trim());
  const wm = workModeLabel(job.workMode);

  const canAccess = hasPortalAccess(user);

  /**
   * Where this listing sits on its own timeline.
   *
   * PUBLIC ON PURPOSE — this line is shown to free users, not just subscribers.
   * A card reading "Last date: 30 Jun" on a job whose exam is still six weeks
   * away looks dead, and a free user bounces. "Applications closed - Exam 8
   * Aug" reads as still worth paying for. The date is the hook; the exam
   * pattern, study material and official links behind the paywall are the
   * product.
   */
  const stage = getJobStage(job);

  /**
   * Everyone now goes to the listing.
   *
   * The old behaviour sent a free user straight to /subscribe, which meant they
   * lost the job they were interested in and were asked an abstract question —
   * "do you want a subscription?" — instead of a concrete one. JobDetails now
   * renders the free half of the listing with the paid sections shown as a
   * locked panel, so the ask happens in context.
   */
  const openJob = () => navigate(`/job/${job.id}`);

  return (
    <div className={`relative min-w-0 bg-gradient-to-b ${theme.grad} to-white rounded-2xl shadow-soft hover:shadow-soft-hover transition p-4 sm:p-5 flex flex-col`}>
      {/* Top row: category + save */}
      <div className="flex items-start justify-between mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 backdrop-blur" style={{ color: theme.ring }}>
          {labelForCategory(categories, job.category)}
        </span>
        <button
          onClick={() => onToggleSave(job.id || '')}
          disabled={savingId === job.id}
          className={`p-2.5 sm:p-1.5 rounded-lg transition shrink-0 ${isSaved ? 'text-[#8b2df2]' : 'text-zinc-400 hover:text-zinc-600'}`}
          title={isSaved ? 'Remove from saved' : 'Save job'}
        >
          {savingId === job.id ? <Loader2 className="w-5 h-5 animate-spin" /> : isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
        </button>
      </div>

      {/* Logo + title + company */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
          {job.companyLogo?.trim() ? (
            <img src={job.companyLogo} alt={company || job.title} className="w-full h-full object-contain p-1.5" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-white font-bold text-xl ${theme.tile}`}>
              {initials(company || job.title)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button onClick={openJob} className="text-left block w-full">
            <h3 className="font-heading font-bold text-zinc-900 text-lg leading-snug hover:text-[#8b2df2] transition line-clamp-2">{job.title}</h3>
          </button>
          {company && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-sm text-zinc-600 truncate">{company}</span>
              <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* Info row: location / experience / salary */}
      {(job.location?.trim() || job.experience?.trim() || job.salary?.trim()) && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-zinc-500 mb-3">
          {job.location?.trim() && (
            <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-4 h-4 shrink-0" /> {job.location}</span>
          )}
          {job.experience?.trim() && (
            <span className="inline-flex items-center gap-1 min-w-0"><Briefcase className="w-4 h-4 shrink-0" /> {job.experience}</span>
          )}
          {job.salary?.trim() && (
            <span className="inline-flex items-center gap-1 min-w-0 font-semibold text-zinc-900"><IndianRupee className="w-4 h-4 shrink-0" /> {job.salary}</span>
          )}
        </div>
      )}

      {/* Skills + work mode pills */}
      {(skills.length > 0 || wm) && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {skills.slice(0, 4).map((s, i) => (
            <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white/70 text-zinc-600 border border-zinc-100">{s}</span>
          ))}
          {skills.length > 4 && (
            <span className="text-xs font-medium px-2 py-1 rounded-lg text-zinc-400">+{skills.length - 4}</span>
          )}
          {wm && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white/70 border border-zinc-100" style={{ color: theme.ring }}>{wm}</span>
          )}
        </div>
      )}

      {/* Stage. Replaces the old bare "Last date: X" line, which said nothing
          about what the date MEANT and so read as dead once it had passed. */}
      {stage.label && (
        <div className={`inline-flex items-center gap-1 text-xs mb-3 ${STAGE_TEXT_CLASS[stage.tone]} ${stage.tone === 'urgent' ? 'font-semibold' : ''}`}>
          <Calendar className="w-3.5 h-3.5 shrink-0" /> {stage.label}
        </div>
      )}

      {/* Footer: posted + view/unlock details.
          The button stays visually strong for both states — every click is a
          conversion opportunity, so it should still invite the press. The lock
          changes the EXPECTATION, not the appeal: a free user now knows there
          is a gate before they click, which turns an ambush into a decision. */}
      <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-zinc-400 min-w-0">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{formatDate(job.createdAt) || 'Recently'}</span>
        </span>
        <button onClick={openJob} className={`shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap bg-gradient-to-r ${theme.btn} text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90 transition`}>
          {canAccess ? (
            <>View Details <ArrowRight className="w-4 h-4 shrink-0" /></>
          ) : (
            <><Lock className="w-3.5 h-3.5 shrink-0" /> Unlock Details</>
          )}
        </button>
      </div>
    </div>
  );
}