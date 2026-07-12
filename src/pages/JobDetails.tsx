import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPortalAccess } from '../lib/access';
import { getJob } from '../lib/jobsData';
import { Job } from '../types';
import { categoryBadgeClass, categoryLabel, formatDate } from '../lib/format';
import { ArrowLeft, Calendar, GraduationCap, Users, Lock, Loader2, FileText, BookOpen, Sparkles, Clock } from 'lucide-react';

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#8b2df2]/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#8b2df2]" />
      </div>
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-medium text-zinc-900">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function JobDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const canAccess = hasPortalAccess(user);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const j = await getJob(id); // cached (reuses dashboard's jobs if loaded)
      if (j) setJob(j);
      else setNotFound(true);
    } catch (e) {
      console.error('Error loading job:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>;
  }

  if (notFound || !job) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto text-center py-20">
        <p className="text-zinc-500 mb-4">This job could not be found.</p>
        <Link to="/dashboard" className="text-[#8b2df2] font-medium hover:underline">← Back to jobs</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass(job.category)}`}>{categoryLabel(job.category)}</span>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-zinc-900 mt-3">{job.title}</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <InfoRow icon={Users} label="Age Limit" value={job.ageLimit} />
          <InfoRow icon={Calendar} label="Last Date to Apply" value={formatDate(job.applicationEndDate)} />
        </div>
      </div>

      {!canAccess && job.applicationEndDate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            Applications close on <span className="font-semibold">{formatDate(job.applicationEndDate)}</span>. Subscribe now to get full details before the deadline.
          </p>
        </div>
      )}

      {canAccess ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Full Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoRow icon={Calendar} label="Notification Date" value={formatDate(job.notificationDate)} />
              <InfoRow icon={Calendar} label="Application Start" value={formatDate(job.applicationStartDate)} />
              <InfoRow icon={Calendar} label="Application End" value={formatDate(job.applicationEndDate)} />
              <div className="sm:col-span-2">
                <InfoRow icon={GraduationCap} label="Educational Qualification" value={job.educationalQualification} />
              </div>
            </div>
          </div>

          {job.examDetails?.trim() && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Exam Details</h2>
              </div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{job.examDetails}</p>
            </div>
          )}
          {job.studyMaterial?.trim() && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Study Material</h2>
              </div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{job.studyMaterial}</p>
            </div>
          )}
          {job.customSections?.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-soft p-6">
              <h2 className="font-heading text-base font-semibold text-zinc-900 mb-3">{section.title}</h2>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#8b2df2]/5 to-[#00b4d8]/5 border border-[#8b2df2]/20 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-soft flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-[#8b2df2]" />
          </div>
          <h3 className="font-heading text-lg font-bold text-zinc-900">Full details are locked</h3>
          <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">
            Subscribe to see notification date, application window, eligibility, exam details, study material, and everything else — for this job and every other listing.
          </p>
          <Link
            to="/subscribe"
            className="inline-flex items-center gap-2 mt-5 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-6 py-3 text-sm font-semibold shadow-soft hover:opacity-90 transition"
          >
            <Sparkles className="w-4 h-4" /> Subscribe to unlock
          </Link>
        </div>
      )}
    </div>
  );
}