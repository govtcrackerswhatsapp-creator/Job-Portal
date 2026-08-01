import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getJob } from '../lib/jobsData';
import { getCategories, labelForCategory, colorForCategory } from '../lib/categoriesData';
import { Job, Category, ContentRowKind } from '../types';
import { categoryBadgeStyle, workModeLabel, formatDate } from '../lib/format';
import { getJobStage, STAGE_TEXT_CLASS } from '../lib/jobStage';
import { FormattedText, isEmptyHtml, safeUrl } from '../lib/richText';
import { ArrowLeft, ArrowRight, Calendar, GraduationCap, Users, Loader2, FileText, BookOpen, ExternalLink, MapPin, Briefcase, IndianRupee, BadgeCheck, Code2, Info, Building2, CalendarCheck, Lock } from 'lucide-react';

function initials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

/**
 * Maps a manifest row's kind to its icon.
 *
 * The server sends a kind rather than an icon name, because lucide components
 * cannot cross a JSON boundary and hardcoding icon strings server-side would
 * couple the API to whichever icon library the frontend happens to use.
 */
const ROW_ICON: Record<ContentRowKind, typeof Calendar> = {
  exam: FileText,
  study: BookOpen,
  section: Info,
  links: ExternalLink,
};

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
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      // Both cached and independent, so fetch together.
      const [j, cats] = await Promise.all([getJob(id), getCategories()]);
      setCategories(cats);
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
      <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto text-center py-20">
        <p className="text-zinc-500 mb-4">This job could not be found.</p>
        <Link to="/dashboard" className="text-[#8b2df2] font-medium hover:underline">← Back to jobs</Link>
      </div>
    );
  }

  /**
   * NO REDIRECT, AND NO CLIENT-SIDE DECISION.
   *
   * api/jobs.ts deletes examDetails, studyMaterial, customSections and
   * linkButtons from the payload for anyone not entitled to them, and sends
   * `locked` plus `contentSummary` instead. The guards below are presentation,
   * not protection: on a locked job there is simply nothing to render.
   */
  const locked = job.locked === true;
  const lockedRows = job.contentSummary || [];

  const company = (job.companyName || '').trim();
  const skills = (job.skills || []).filter((s) => s.trim());
  const wm = workModeLabel(job.workMode);

  /**
   * Where this listing sits on its own timeline. The same helper the card and
   * the Active/Expired tabs use, so all three can never disagree.
   */
  const stage = getJobStage(job);

  // Button URLs go through the same allow-list as links inside rich text.
  // Empty for a locked job — the server never sent linkButtons.
  const linkButtons = (job.linkButtons || [])
    .map((b) => ({ ...b, url: safeUrl(b.url || '') }))
    .filter((b) => b.text?.trim() && !!b.url) as { text: string; url: string; bgColor: string; textColor: string }[];
  const customSections = (job.customSections || []).filter((s) => s.title?.trim() || !isEmptyHtml(s.content));
  const hasSummary = !!(job.experience || job.salary || job.location || wm || job.applicationEndDate || job.examDate) || !isEmptyHtml(job.ageLimit);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6 mb-4">
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
            <div className="flex items-center gap-2 flex-wrap">
              {/* Inline styles, not Tailwind classes: the colour comes from
                  Firestore and Tailwind cannot generate classes at runtime. */}
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full border"
                style={categoryBadgeStyle(colorForCategory(categories, job.category))}
              >
                {labelForCategory(categories, job.category)}
              </span>
              {stage.label && (
                <span className={`text-xs font-medium ${STAGE_TEXT_CLASS[stage.tone]}`}>
                  {stage.label}
                </span>
              )}
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-zinc-900 mt-2">{job.title}</h1>
            {company && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-base text-zinc-600">{company}</span>
                <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
              </div>
            )}
            {/* Info row */}
            {(job.location?.trim() || job.experience?.trim() || job.salary?.trim() || wm) && (
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-zinc-500 mt-3">
                {job.location?.trim() && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-4 h-4 shrink-0" /> {job.location}</span>}
                {job.experience?.trim() && <span className="inline-flex items-center gap-1 min-w-0"><Briefcase className="w-4 h-4 shrink-0" /> {job.experience}</span>}
                {job.salary?.trim() && <span className="inline-flex items-center gap-1 min-w-0 font-semibold text-zinc-900"><IndianRupee className="w-4 h-4 shrink-0" /> {job.salary}</span>}
                {wm && <span className="inline-flex items-center gap-1 min-w-0"><Building2 className="w-4 h-4 shrink-0" /> {wm}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Applications closed but the exam is still ahead — the case examDate
          exists for. Stated plainly at the top so nobody has to work it out by
          comparing two dates further down the page. */}
      {stage.kind === 'exam-ahead' && job.applicationEndDate && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <CalendarCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Applications closed on {formatDate(job.applicationEndDate)}
            </p>
            {job.examDate && (
              <p className="text-sm text-amber-800 mt-0.5">
                The exam is scheduled for {formatDate(job.examDate)}. Details below remain available for preparation.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Key info — free for everyone. Age limit and qualification live here
              deliberately: they are how an aspirant decides whether the listing
              applies to them at all, and gating that would mean charging someone
              for the right to discover they were never eligible. */}
          <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
            <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Key Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SummaryItem icon={Calendar} label="Notification Date" value={formatDate(job.notificationDate)} />
              <SummaryItem icon={Calendar} label="Application Start" value={formatDate(job.applicationStartDate)} />
              <SummaryItem icon={Calendar} label="Last Date to Apply" value={formatDate(job.applicationEndDate)} />
              {/* Distinct icon so the exam date is not mistaken for another
                  application deadline at a glance. */}
              <SummaryItem icon={CalendarCheck} label="Exam Date" value={formatDate(job.examDate)} />
            </div>
            {(!isEmptyHtml(job.ageLimit) || !isEmptyHtml(job.educationalQualification)) && (
              <div className="space-y-5 mt-5 pt-5 border-t border-zinc-100">
                <RichItem icon={Users} label="Age Limit" value={job.ageLimit} />
                <RichItem icon={GraduationCap} label="Educational Qualification" value={job.educationalQualification} />
              </div>
            )}
          </div>

          {/* ---- Paid sections. On a locked job these are all absent from the
                  payload, so the isEmptyHtml checks alone would suffice — the
                  `!locked` guards are kept as documentation of intent. ---- */}
          {!locked && !isEmptyHtml(job.examDetails) && (
            <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Exam Details</h2>
              </div>
              <FormattedText value={job.examDetails} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          )}

          {!locked && !isEmptyHtml(job.studyMaterial) && (
            <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">Study Material</h2>
              </div>
              <FormattedText value={job.studyMaterial} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          )}

          {!locked && customSections.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
              {section.title?.trim() && (
                <h2 className="font-heading text-base font-semibold text-zinc-900 mb-3">{section.title}</h2>
              )}
              <FormattedText value={section.content} className="text-sm text-zinc-700 leading-relaxed" />
            </div>
          ))}

          {!locked && linkButtons.length > 0 && (
            <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
              <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Important Links</h2>
              <div className="flex flex-wrap gap-3">
                {linkButtons.map((btn, i) => (
                  <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 max-w-full px-5 py-2.5 rounded-xl text-sm font-semibold shadow-soft hover:opacity-90 transition" style={{ backgroundColor: btn.bgColor || '#8b2df2', color: btn.textColor || '#ffffff' }}>
                    {btn.text} <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ---- Or, when locked, ONE panel describing what is behind the gate.
                  Rows come from the server, which builds them fresh on every
                  request — so the manifest can never drift out of step with the
                  content, and it never carries a word of it.

                  The panel is deliberately the loudest thing on the page: a red
                  hairline border, a tinted header strip and red row labels. It
                  was previously plain dark text on white and read as ordinary
                  content, so a free user's eye slid straight past the one block
                  that exists to be noticed. ---- */}
          {locked && lockedRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-soft border border-red-200 overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-5 sm:px-6 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-5 h-5 text-red-600 shrink-0" />
                  <h2 className="font-heading text-base font-semibold text-red-700">Locked — what's inside this listing</h2>
                </div>
                <p className="text-sm text-red-600/80">
                  {lockedRows.length} {lockedRows.length === 1 ? 'section' : 'sections'} prepared for this posting
                </p>
              </div>

              <div className="px-5 sm:px-6 pt-1 pb-5 sm:pb-6">
                <div>
                  {lockedRows.map((row, i) => {
                    const RowIcon = ROW_ICON[row.kind] || Info;
                    return (
                      <div key={i} className={`flex items-center justify-between gap-3 py-3 ${i < lockedRows.length - 1 ? 'border-b border-zinc-100' : ''}`}>
                        <span className="inline-flex items-center gap-2.5 min-w-0 text-sm font-semibold text-red-600">
                          <RowIcon className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="truncate">{row.label}</span>
                        </span>
                        {/* Kept muted on purpose. If the note were red too the
                            row would have no hierarchy and the label — the part
                            that does the selling — would stop leading. */}
                        <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">{row.note}</span>
                      </div>
                    );
                  })}
                </div>

                {/* A single CTA. Repeating an upgrade button beside every locked
                    row reads as desperate and stops being seen after the third. */}
                <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-zinc-500">Unlocks this and every other listing</p>
                  <button
                    onClick={() => navigate('/subscribe')}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition"
                  >
                    Unlock full details <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
            <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Job Summary</h2>
            <div className="space-y-4">
              <SummaryItem icon={Briefcase} label="Experience" value={job.experience || ''} />
              <SummaryItem icon={IndianRupee} label="Salary" value={job.salary || ''} />
              <SummaryItem icon={MapPin} label="Location" value={job.location || ''} />
              <SummaryItem icon={Building2} label="Work Mode" value={wm} />
              <SummaryItem icon={Calendar} label="Last Date" value={formatDate(job.applicationEndDate)} />
              <SummaryItem icon={CalendarCheck} label="Exam Date" value={formatDate(job.examDate)} />
              {!hasSummary && (
                <p className="text-sm text-zinc-400">No summary details added.</p>
              )}
            </div>
          </div>

          {skills.length > 0 && (
            <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
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
            <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-5 h-5 text-[#8b2df2]" />
                <h2 className="font-heading text-base font-semibold text-zinc-900">About {company}</h2>
              </div>
              {/* The links sentence is dropped when locked — pointing at "the
                  important links above" when none are rendered looks broken. */}
              <p className="text-sm text-zinc-500">
                {locked
                  ? `${company} is hiring for this position.`
                  : `${company} is hiring for this position. See the important links above for the official notification and how to apply.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}