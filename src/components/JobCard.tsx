import { useNavigate } from 'react-router-dom';
import { Job, UserProfile } from '../types';
import { hasPortalAccess } from '../lib/access';
import { categoryLabel, workModeLabel, formatDate } from '../lib/format';
import { MapPin, Briefcase, IndianRupee, BadgeCheck, Bookmark, BookmarkCheck, ArrowRight, Loader2, Calendar, Clock } from 'lucide-react';

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
}

export default function JobCard({ job, index, user, isSaved, onToggleSave, savingId }: JobCardProps) {
  const navigate = useNavigate();
  const theme = THEMES[index % THEMES.length];
  const company = (job.companyName || '').trim();
  const skills = (job.skills || []).filter((s) => s.trim());
  const wm = workModeLabel(job.workMode);

  // Clicking the card / View Details: paid users -> details, free users -> subscribe.
  const openJob = () => {
    if (hasPortalAccess(user)) navigate(`/job/${job.id}`);
    else navigate('/subscribe');
  };

  return (
    <div className={`relative bg-gradient-to-b ${theme.grad} to-white rounded-2xl shadow-soft hover:shadow-soft-hover transition p-5 flex flex-col`}>
      {/* Top row: category + save */}
      <div className="flex items-start justify-between mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 backdrop-blur" style={{ color: theme.ring }}>
          {categoryLabel(job.category)}
        </span>
        <button
          onClick={() => onToggleSave(job.id || '')}
          disabled={savingId === job.id}
          className={`p-1.5 rounded-lg transition shrink-0 ${isSaved ? 'text-[#8b2df2]' : 'text-zinc-400 hover:text-zinc-600'}`}
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
            <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>
          )}
          {job.experience?.trim() && (
            <span className="inline-flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.experience}</span>
          )}
          {job.salary?.trim() && (
            <span className="inline-flex items-center gap-1 font-semibold text-zinc-900"><IndianRupee className="w-4 h-4" /> {job.salary}</span>
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

      {/* Last date (if present) */}
      {job.applicationEndDate && (
        <div className="inline-flex items-center gap-1 text-xs text-zinc-400 mb-3">
          <Calendar className="w-3.5 h-3.5" /> Last date: {formatDate(job.applicationEndDate)}
        </div>
      )}

      {/* Footer: posted + view details */}
      <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
          <Clock className="w-3.5 h-3.5" /> {formatDate(job.createdAt) || 'Recently'}
        </span>
        <button onClick={openJob} className={`inline-flex items-center gap-1.5 bg-gradient-to-r ${theme.btn} text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90 transition`}>
          View Details <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}