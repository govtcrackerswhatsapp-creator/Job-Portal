import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPortalAccess } from '../lib/access';
import { getJob } from '../lib/jobsData';
import { Job } from '../types';
import { categoryBadgeClass, categoryLabel, workModeLabel, formatDate } from '../lib/format';
import { FormattedText, isEmptyHtml } from '../lib/richText';
import { ArrowLeft, Calendar, GraduationCap, Users, Loader2, FileText, BookOpen, ExternalLink, MapPin, Briefcase, IndianRupee, BadgeCheck, Code2, Info, Building2 } from 'lucide-react';

function initials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

/** Short, single-line values (dates, salary, location...). */
function SummaryItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#8b2df2]/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#8b2df2]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        {/* whitespace-pre-wrap so multi-line values keep their line breaks */}
        <p className="text-sm font-medium text-zinc-900 break-words whitespace-pre-wrap">{value}</p>
      </div>
    </div>
  );
}

/** Long, formatted values (age limit, qualifications) — renders lists, bold, line breaks. */
function RichItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value?: string | null }) {
  if (isEmptyHtml(value)) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#8b2df2]/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#8b2df2]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
        <FormattedText value={value} className="text-sm text-zinc-800 leading-relaxed break-words" />
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
      const j = await getJob(id);
      if (j) setJob(j);
      else setNotFound(true);
    } catch (e) {
      console.error('Error loading job:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // Strict gate: non-subscribers never see job details — send them to subscribe.
  if (!canAccess) {
    return <Navigate to="/subscribe" replace />;
  }

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

  const company = (job.companyName || '').trim();
  const skills = (job.skills || []).filter((s) => s.trim());
  const wm = workModeLabel(job.workMode);
  const linkButtons = (job.linkButtons || []).filter((b) => b.text?.trim() && b.url?.trim());
  const customSections = (job.customSections || []).filter((s) => s.title?.trim() || !isEmptyHtml(s.content));
  const hasSummary = !!(job.experience || job.salary || job.location || wm || job.applicationEndDate) || !isEmptyHtml(job.ageLimit);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-20 h-20 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0 overflow-hidden">
            {job.companyLogo?.trim() ? (
              <img src={job.companyLogo} alt={company || job.title} className="w-full h-full object-contain p-2" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl bg-gradient-to-br from-[#8b2df2] to-[#00b4d8]">
                {initials(company || job.title)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass(job.category)}`}>{categoryLabel(job.category)}</span>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-zinc-900 mt-2">{job.title}</h1>
            {company && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-base text-zinc-600">{company}</span>
                <BadgeCheck className="w-4 h-4 text-blue-500" />
              </div>
            )}
            {/* Info row */}
            {(job.location?.trim() || job.experience?.trim() || job.salary?.trim() || wm) && (
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-zinc-500 mt-3">
                {job.location?.trim() && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>}
                {job.experience?.trim() && <span className="inline-flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.experience}</span>}
                {job.salary?.trim() && <span className="inline-flex items-center gap-1 font-semibold text-zinc-900"><IndianRupee className="w-4 h-4" /> {job.salary}</span>}
                {wm && <span className="inline-flex items-center gap-1"><Building2 className="w-4 h-4" /> {wm}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Key info */}
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Key Information</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <SummaryItem icon={Calendar} label="Notification Date" value={formatDate(job.notificationDate)} />
              <SummaryItem icon={Calendar} label="Application Start" value={formatDate(job.applicationStartDate)} />
              <SummaryItem icon={Calendar} label="Last Date to Apply" value={formatDate(job.applicationEndDate)} />
            </div>
            {(!isEmptyHtml(job.ageLimit) || !isEmptyHtml(job.educationalQualification)) && (
              <div className="space-y-5 mt-5 pt-5 border-t border-zinc-100">
                <RichItem icon={Users} label="Age Limit" value={job.ageLimit} />
                <RichItem icon={GraduationCap} label="Educational Qualification" value={job.educationalQualification} />
              </div>
            )}
          </div>

          {!isEmptyHtml(job.examDetails) && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Exam Details</h2>
              </div>
              <FormattedText value={job.examDetails} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          )}

          {!isEmptyHtml(job.studyMaterial) && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Study Material</h2>
              </div>
              <FormattedText value={job.studyMaterial} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          )}

          {customSections.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-soft p-6">
              {section.title?.trim() && (
                <h2 className="font-heading text-base font-semibold text-zinc-900 mb-3">{section.title}</h2>
              )}
              <FormattedText value={section.content} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          ))}

          {linkButtons.length > 0 && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Important Links</h2>
              <div className="flex flex-wrap gap-3">
                {linkButtons.map((btn, i) => (
                  <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-soft hover:opacity-90 transition" style={{ backgroundColor: btn.bgColor || '#8b2df2', color: btn.textColor || '#ffffff' }}>
                    {btn.text} <ExternalLink className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Job Summary</h2>
            <div className="space-y-4">
              <SummaryItem icon={Briefcase} label="Experience" value={job.experience || ''} />
              <SummaryItem icon={IndianRupee} label="Salary" value={job.salary || ''} />
              <SummaryItem icon={MapPin} label="Location" value={job.location || ''} />
              <SummaryItem icon={Building2} label="Work Mode" value={wm} />
              <RichItem icon={Users} label="Age Limit" value={job.ageLimit} />
              <SummaryItem icon={Calendar} label="Last Date" value={formatDate(job.applicationEndDate)} />
              {!hasSummary && (
                <p className="text-sm text-zinc-400">No summary details added.</p>
              )}
            </div>
          </div>

          {skills.length > 0 && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Skills</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => (
                  <span key={i} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-50 text-zinc-700 border border-zinc-100">{s}</span>
                ))}
              </div>
            </div>
          )}

          {company && (
            <div className="bg-white rounded-2xl shadow-soft p-6">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">About {company}</h2>
              </div>
              <p className="text-sm text-zinc-500">{company} is hiring for this position. See the important links above for the official notification and how to apply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}