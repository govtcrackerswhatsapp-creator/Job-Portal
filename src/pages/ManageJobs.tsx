import { useEffect, useState, ReactNode, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJobs, clearJobsCache } from '../lib/jobsData';
import { getCategories, getActiveCategories, labelForCategory, colorForCategory } from '../lib/categoriesData';
import { Job, Category, JobCategory, JobSection, JobLinkButton, WorkMode } from '../types';
import { categoryBadgeStyle, formatDate, dateInputToTimestamp, timestampToDateInput } from '../lib/format';
import { isJobExpired, getJobStage, STAGE_TEXT_CLASS } from '../lib/jobStage';
import { sanitizeHtml, isEmptyHtml } from '../lib/richText';
import RichTextEditor from '../components/RichTextEditor';
import JobImportPanel from '../components/JobImportPanel';
import { jobIdentity, HOLD_LABEL_MAX } from '../lib/jobImport';
import { downloadJobsExport } from '../lib/jobTemplate';
import { Plus, Pencil, Trash2, X, Loader2, Save, Briefcase, AlertTriangle, ArrowUp, ArrowDown, Link as LinkIcon, Upload, Download, Search, CalendarCheck, PauseCircle, PlayCircle, Clock } from 'lucide-react';

interface JobFormState {
  refCode: string;
  title: string;
  category: JobCategory;
  ageLimit: string;
  notificationDate: number | null;
  applicationStartDate: number | null;
  applicationEndDate: number | null;
  examDate: number | null;
  educationalQualification: string;
  examDetails: string;
  studyMaterial: string;
  customSections: JobSection[];
  linkButtons: JobLinkButton[];
  companyName: string;
  companyLogo: string;
  salary: string;
  experience: string;
  location: string;
  workMode: WorkMode | '';
  skills: string;
}

/**
 * `category` starts EMPTY rather than 'government'. That id can now be renamed
 * or disabled, so openCreate() fills it from the first active category instead
 * of assuming one exists.
 */
const EMPTY_JOB: JobFormState = {
  refCode: '', title: '', category: '', ageLimit: '',
  notificationDate: null, applicationStartDate: null, applicationEndDate: null, examDate: null,
  educationalQualification: '', examDetails: '', studyMaterial: '', customSections: [], linkButtons: [],
  companyName: '', companyLogo: '', salary: '', experience: '', location: '', workMode: '', skills: '',
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

// Shared with the bulk importer (lib/format.ts) so both paths store dates identically.
const dateToInput = timestampToDateInput;
const inputToTimestamp = dateInputToTimestamp;

type RangeMode = 'all' | '7d' | '30d' | '90d' | 'custom';

/** The three buckets a job can be in. Hold wins over the date-derived pair. */
type View = 'active' | 'expired' | 'hold';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A hold older than this is flagged in the Hold tab.
 *
 * Hold has no end date by design — you said so, and a date you have to guess is
 * a date you end up ignoring. The cost of that choice is that a hold can sit
 * there forever, so ageing is the safety net: the tab sorts oldest-first and
 * anything past this threshold says so out loud.
 */
const STALE_HOLD_DAYS = 90;

/** "held 47 days ago", for the Hold tab. */
function heldAgo(ms?: number | null): string {
  if (!ms) return 'on hold';
  const days = Math.floor((Date.now() - ms) / DAY_MS);
  if (days <= 0) return 'held today';
  if (days === 1) return 'held yesterday';
  return `held ${days} days ago`;
}

function holdAgeDays(ms?: number | null): number {
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / DAY_MS);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default function ManageJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategories, setActiveCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<JobFormState>({ ...EMPTY_JOB });
  const [view, setView] = useState<View>('active');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Hold dialog. Kept OUT of the job form on purpose: holding is a decision
  // about a listing, not a property you edit alongside its salary. Putting it
  // in the form would mean opening a held job to fix a typo and risking the
  // flag on save.
  const [holdTarget, setHoldTarget] = useState<Job | null>(null);
  const [holdLabelInput, setHoldLabelInput] = useState('');
  const [holdNoteInput, setHoldNoteInput] = useState('');
  const [holdSaving, setHoldSaving] = useState(false);
  /** The job open in the form, so its hold state can be shown read-only. */
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // Export panel
  const [showExport, setShowExport] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // The rich-text editors are uncontrolled (that is what stops the caret jumping).
  // Bumping these counters changes their React `key`, forcing a clean remount with
  // fresh content — needed whenever we load a different record or reshuffle sections.
  const [formKey, setFormKey] = useState(0);
  const [sectionsKey, setSectionsKey] = useState(0);

  useEffect(() => { fetchJobs(); fetchCategories(); }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const list = await getJobs(true);
      setJobs(list);
    } catch (e) {
      console.error('Error fetching jobs:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      // ALL for rendering badges (a job may sit in a disabled category and must
      // still show its real name), ACTIVE for the form's dropdown.
      const [all, active] = await Promise.all([getCategories(), getActiveCategories()]);
      setCategories(all);
      setActiveCategories(active);
    } catch (e) {
      console.error('Error fetching categories:', e);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 5000);
  };

  /**
   * Expiry now comes from lib/jobStage, which is also what the job card uses.
   * One implementation means the Expired tab and the card can never disagree
   * about the same job. The rule: examDate when set, otherwise
   * applicationEndDate, and a 30-day age fallback for jobs carrying neither.
   */
  /**
   * THREE buckets, and hold is checked FIRST.
   *
   * isJobExpired() is untouched — a held job whose dates have passed is still
   * expired and still reports so. What changes is only where it FILES: held
   * jobs leave the Expired list entirely, which is what puts them out of reach
   * of deletableExpired and therefore of "Delete All Expired".
   */
  const heldJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.onHold)
        // Oldest hold first — the OPPOSITE of every other list here, which is
        // newest-first. A hold that has been sitting for six months is the one
        // that needs attention, so it must not sink to the bottom.
        .sort((a, b) => (a.heldAt ?? 0) - (b.heldAt ?? 0)),
    [jobs],
  );
  const activeJobs = useMemo(() => jobs.filter((j) => !j.onHold && !isJobExpired(j)), [jobs]);
  const expiredJobs = useMemo(() => jobs.filter((j) => !j.onHold && isJobExpired(j)), [jobs]);

  /** Holds past STALE_HOLD_DAYS. Surfaced so a hold cannot quietly become permanent. */
  const staleHolds = useMemo(
    () => heldJobs.filter((j) => holdAgeDays(j.heldAt) >= STALE_HOLD_DAYS),
    [heldJobs],
  );

  /** Matches title, company, location and the reference code. */
  const matchesSearch = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return () => true;
    return (job: Job) =>
      job.title.toLowerCase().includes(term) ||
      (job.companyName || '').toLowerCase().includes(term) ||
      (job.location || '').toLowerCase().includes(term) ||
      // jobIdentity, not job.refCode: 13 of the existing jobs have no stored
      // refCode and derive theirs from title + company + category. Searching the
      // raw field would silently miss every one of them.
      jobIdentity(job).toLowerCase().includes(term);
  }, [search]);

  const filteredActive = useMemo(() => activeJobs.filter(matchesSearch), [activeJobs, matchesSearch]);
  const filteredExpired = useMemo(() => expiredJobs.filter(matchesSearch), [expiredJobs, matchesSearch]);
  const filteredHeld = useMemo(() => heldJobs.filter(matchesSearch), [heldJobs, matchesSearch]);
  const shownJobs = view === 'active' ? filteredActive : view === 'expired' ? filteredExpired : filteredHeld;

  /**
   * Matches sitting in the tab you are NOT looking at. Without this, searching
   * "afcat" in Active and finding nothing reads as "it does not exist" when it
   * is in fact one tab away.
   */
  const otherTabs: { id: View; label: string; count: number }[] = [
    { id: 'active', label: 'Active', count: filteredActive.length },
    { id: 'expired', label: 'Expired', count: filteredExpired.length },
    { id: 'hold', label: 'On Hold', count: filteredHeld.length },
  ].filter((t) => t.id !== view && t.count > 0);
  const otherTabMatches = otherTabs.reduce((n, t) => n + t.count, 0);

  // Managers may only delete jobs they created (enforced by Firestore rules too),
  // so anything they cannot delete is not offered for selection.
  const canDelete = (job: Job) => user?.role === 'superadmin' || job.createdBy === user?.uid;
  /**
   * Hold is a SUPERADMIN decision, and the Firestore rules enforce that by
   * pinning the hold fields on the manager branch. This flag keeps the UI
   * honest about it — without it a manager would see Hold on their own job,
   * click it, and get a bare permission error from Firestore.
   */
  const canHold = user?.role === 'superadmin';
  // Scoped to what is VISIBLE: with a search active, "Delete All Expired" must
  // not reach past the filter into jobs you cannot see.
  const deletableExpired = filteredExpired.filter((j) => j.id && canDelete(j));
  /**
   * Held jobs are selectable for deletion too — you asked to be able to clear
   * them from this tab whenever you like. What they deliberately do NOT get is
   * a "Delete All" sweep: the whole point of hold is that nothing in it is
   * removed en masse by accident.
   */
  const deletableHeld = filteredHeld.filter((j) => j.id && canDelete(j));

  /**
   * Active jobs are selectable too.
   *
   * They were excluded, which left deleting a live listing as a one-at-a-time
   * job — painful after a bad bulk import, and the reason three duplicate
   * listings sat around. Selection is safe here because it is explicit: you
   * tick what goes.
   *
   * What Active deliberately does NOT get is the "Delete All" sweep. That
   * button stays gated to the Expired tab below. An expired listing is already
   * dead; an active one is on the dashboard right now, so removing it should
   * always cost you the effort of ticking boxes.
   */
  const deletableActive = filteredActive.filter((j) => j.id && canDelete(j));

  const selectable =
    view === 'active' ? deletableActive : view === 'expired' ? deletableExpired : deletableHeld;
  const allSelected = selectable.length > 0 && selectable.every((j) => selectedIds.includes(j.id!));

  const toggleSelect = (id?: string) => {
    if (!id) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : selectable.map((j) => j.id!));
  };
  const switchView = (v: View) => { setView(v); setSelectedIds([]); };

  /** Delete a list of job ids, continuing past individual failures. */
  const deleteMany = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} ${label}? This cannot be undone.`)) return;
    try {
      setBulkDeleting(true);
      let failed = 0;
      for (const id of ids) {
        try {
          await deleteDoc(doc(db, 'jobs', id));
        } catch (e) {
          failed++;
          console.error(`Could not delete job ${id}:`, e);
        }
      }
      clearJobsCache();
      setSelectedIds([]);
      await fetchJobs();
      if (failed > 0) alert(`${ids.length - failed} deleted. ${failed} could not be deleted — you can only delete jobs you created.`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const openImport = async () => {
    // Refresh first: matching is done against this list, and a stale list would
    // duplicate a job another admin added since the page loaded.
    if (!showImport) await fetchJobs();
    setShowExport(false);
    setShowImport((v) => !v);
  };

  // ---------------------------------------------------------------- export

  /** Start of the window, or null for "all time". Filters on createdAt. */
  const rangeStart = useMemo((): number | null => {
    const DAY = 24 * 60 * 60 * 1000;
    if (rangeMode === 'all') return null;
    if (rangeMode === '7d') return Date.now() - 7 * DAY;
    if (rangeMode === '30d') return Date.now() - 30 * DAY;
    if (rangeMode === '90d') return Date.now() - 90 * DAY;
    return customFrom ? inputToTimestamp(customFrom) : null;
  }, [rangeMode, customFrom]);

  /** End of the window. Custom "to" covers the whole of its final day. */
  const rangeEnd = useMemo((): number | null => {
    if (rangeMode !== 'custom' || !customTo) return null;
    const ms = inputToTimestamp(customTo);
    return ms === null ? null : ms + 24 * 60 * 60 * 1000 - 1;
  }, [rangeMode, customTo]);

  const exportScope = useMemo(() => {
    // Managers get their own jobs — those are the ones they can re-import,
    // since Firestore rules block updating anyone else's.
    const base = user?.role === 'superadmin' ? shownJobs : shownJobs.filter((j) => j.createdBy === user?.uid);
    return base.filter((j) => {
      if (rangeStart !== null && j.createdAt < rangeStart) return false;
      if (rangeEnd !== null && j.createdAt > rangeEnd) return false;
      return true;
    });
  }, [shownJobs, user, rangeStart, rangeEnd]);

  /** Goes into the filename so successive exports do not overwrite each other. */
  const rangeLabel = useMemo(() => {
    if (rangeMode === 'all') return '';
    if (rangeMode === 'custom') {
      if (!customFrom && !customTo) return '';
      return `${customFrom || 'start'}_${customTo || 'now'}`;
    }
    return rangeMode;
  }, [rangeMode, customFrom, customTo]);

  const handleExport = () => {
    if (exportScope.length === 0) { alert('Nothing matches that range in this view.'); return; }
    downloadJobsExport(exportScope, view, rangeLabel || undefined);
    setShowExport(false);
  };

  // ---------------------------------------------------------------- form

  const openCreate = () => {
    setForm({ ...EMPTY_JOB, category: activeCategories[0]?.id || '' });
    setEditingId(null);
    setEditingJob(null);
    setFormKey((k) => k + 1);
    setSectionsKey((k) => k + 1);
    setShowForm(true);
  };

  const openEdit = (job: Job) => {
    setForm({
      refCode: job.refCode || '', title: job.title, category: job.category, ageLimit: job.ageLimit,
      notificationDate: job.notificationDate ?? null, applicationStartDate: job.applicationStartDate ?? null, applicationEndDate: job.applicationEndDate ?? null,
      examDate: job.examDate ?? null,
      educationalQualification: job.educationalQualification, examDetails: job.examDetails || '', studyMaterial: job.studyMaterial || '',
      customSections: job.customSections ? [...job.customSections] : [],
      linkButtons: job.linkButtons ? [...job.linkButtons] : [],
      companyName: job.companyName || '', companyLogo: job.companyLogo || '', salary: job.salary || '',
      experience: job.experience || '', location: job.location || '', workMode: job.workMode || '',
      skills: (job.skills || []).join(', '),
    });
    setEditingId(job.id || null);
    // Kept so the form can SHOW the hold state without carrying it in form
    // state. JobFormState has no hold fields, so handleSave's payload cannot
    // mention them, so saving an edit can never disturb a hold. That is the
    // guarantee; editingJob is only for display.
    setEditingJob(job);
    setFormKey((k) => k + 1);
    setSectionsKey((k) => k + 1);
    setShowForm(true);
  };

  // ---------------------------------------------------------------- hold

  const openHold = (job: Job) => {
    setHoldTarget(job);
    setHoldLabelInput(job.holdLabel || '');
    setHoldNoteInput(job.holdNote || '');
  };

  const closeHold = () => {
    setHoldTarget(null);
    setHoldLabelInput('');
    setHoldNoteInput('');
  };

  /**
   * Put a job on hold, or save an edit to an existing hold.
   *
   * heldAt is stamped ONLY on a fresh hold. Re-saving the label on a job that
   * is already held must not restart the clock, or the ageing that keeps holds
   * visible would reset every time you tidied up a label.
   */
  const confirmHold = async () => {
    if (!holdTarget?.id) return;
    const label = holdLabelInput.trim();
    if (!label) { alert('Enter a status label. It is shown publicly on the job card.'); return; }
    try {
      setHoldSaving(true);
      const wasHeld = holdTarget.onHold === true;
      const payload: Record<string, unknown> = {
        onHold: true,
        holdLabel: label.slice(0, HOLD_LABEL_MAX),
        holdNote: holdNoteInput.trim(),
      };
      if (!wasHeld) payload.heldAt = Date.now();
      await updateDoc(doc(db, 'jobs', holdTarget.id), payload as any);
      clearJobsCache();
      closeHold();
      await fetchJobs();
      showToast(wasHeld ? 'Hold updated.' : 'Moved to On Hold — it is now out of reach of "Delete All Expired".');
    } catch (e) {
      console.error('Error holding job:', e);
      alert('Failed to update hold. Check your permissions.');
    } finally {
      setHoldSaving(false);
    }
  };

  /**
   * Release a hold. Clears all four fields — leaving a stale label behind means
   * it reappears the next time this job is held.
   *
   * The job then re-buckets on its own: Expired if its dates have passed,
   * Active if they have since been edited forward. Nothing here decides that.
   */
  const handleRelease = async (job: Job) => {
    if (!job.id) return;
    if (!confirm(`Release "${job.title}" from hold?\n\nIt will move back to Active or Expired depending on its dates, and can then be removed by "Delete All Expired".`)) return;
    try {
      setBulkDeleting(true);
      await updateDoc(doc(db, 'jobs', job.id), { onHold: false, holdLabel: '', holdNote: '', heldAt: null } as any);
      clearJobsCache();
      await fetchJobs();
      showToast(isJobExpired(job) ? 'Released — moved back to Expired.' : 'Released — moved back to Active.');
    } catch (e) {
      console.error('Error releasing job:', e);
      alert('Failed to release. Check your permissions.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const addSection = () => {
    setForm((f) => ({ ...f, customSections: [...f.customSections, { title: '', content: '' }] }));
    setSectionsKey((k) => k + 1);
  };
  const updateSection = (i: number, field: keyof JobSection, value: string) => {
    setForm((f) => {
      const sections = [...f.customSections];
      sections[i] = { ...sections[i], [field]: value };
      return { ...f, customSections: sections };
    });
  };
  const removeSection = (i: number) => {
    setForm((f) => {
      const sections = [...f.customSections];
      sections.splice(i, 1);
      return { ...f, customSections: sections };
    });
    setSectionsKey((k) => k + 1);
  };

  const addButton = () => setForm({ ...form, linkButtons: [...form.linkButtons, { text: '', url: '', bgColor: '#8b2df2', textColor: '#ffffff' }] });
  const updateButton = (i: number, field: keyof JobLinkButton, value: string) => {
    const btns = [...form.linkButtons];
    btns[i] = { ...btns[i], [field]: value };
    setForm({ ...form, linkButtons: btns });
  };
  const removeButton = (i: number) => {
    const btns = [...form.linkButtons];
    btns.splice(i, 1);
    setForm({ ...form, linkButtons: btns });
  };
  const moveButton = (i: number, dir: -1 | 1) => {
    const btns = [...form.linkButtons];
    const j = i + dir;
    if (j < 0 || j >= btns.length) return;
    [btns[i], btns[j]] = [btns[j], btns[i]];
    setForm({ ...form, linkButtons: btns });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.title.trim()) { alert('Please enter a job title.'); return; }
    if (!form.category) { alert('Please choose a category.'); return; }

    // Identity guard: the same reference must never exist on two jobs. This
    // blocks rather than silently overwriting — in this form you believe you
    // are creating something new, so a silent overwrite would be a nasty
    // surprise. The importer, where you have explicitly asked to reconcile a
    // batch, updates in place instead.
    const identity = jobIdentity({
      refCode: form.refCode,
      title: form.title,
      category: form.category,
      companyName: form.companyName,
    });
    const clash = jobs.find((j) => (j.id || '') !== (editingId || '') && jobIdentity(j) === identity);
    if (clash) {
      alert(
        'Another job already uses the reference "' + identity + '":\n\n' + clash.title +
        '\n\nEdit that job instead, or give this one a different Reference Code.'
      );
      return;
    }

    try {
      setSaving(true);
      // Rich-text fields are sanitised here, so only allow-listed markup ever
      // reaches Firestore. Sections with no title AND no content are dropped.
      const cleanSections = form.customSections
        .filter((s) => s.title.trim() || !isEmptyHtml(s.content))
        .map((s) => ({ title: s.title.trim(), content: sanitizeHtml(s.content) }));
      const cleanButtons = form.linkButtons
        .filter((b) => b.text.trim() && b.url.trim())
        .map((b) => ({ text: b.text.trim(), url: b.url.trim(), bgColor: b.bgColor || '#8b2df2', textColor: b.textColor || '#ffffff' }));
      const cleanSkills = form.skills.split(',').map((s) => s.trim()).filter(Boolean);
      const payload = {
        ...form,
        refCode: identity,
        ageLimit: isEmptyHtml(form.ageLimit) ? '' : sanitizeHtml(form.ageLimit),
        educationalQualification: isEmptyHtml(form.educationalQualification) ? '' : sanitizeHtml(form.educationalQualification),
        examDetails: isEmptyHtml(form.examDetails) ? '' : sanitizeHtml(form.examDetails),
        studyMaterial: isEmptyHtml(form.studyMaterial) ? '' : sanitizeHtml(form.studyMaterial),
        customSections: cleanSections,
        linkButtons: cleanButtons,
        companyName: form.companyName.trim(),
        companyLogo: form.companyLogo.trim(),
        salary: form.salary.trim(),
        experience: form.experience.trim(),
        location: form.location.trim(),
        workMode: form.workMode,
        skills: cleanSkills,
      };

      // Worked out BEFORE the write so we can tell you the job has moved tabs.
      // Editing a job in Expired so that it becomes valid makes it vanish from
      // the list you are looking at, which reads as a failed save without this.
      const wasEditing = !!editingId;
      const existing = editingId ? jobs.find((j) => j.id === editingId) : null;
      const nowExpired = isJobExpired({
        ...(payload as unknown as Job),
        createdAt: existing?.createdAt ?? Date.now(),
      });
      // A held job stays in Hold whatever its dates say — payload carries no
      // hold fields, so the flag survives this write untouched.
      const destTab: View = existing?.onHold ? 'hold' : nowExpired ? 'expired' : 'active';

      if (editingId) {
        await updateDoc(doc(db, 'jobs', editingId), payload as any);
      } else {
        await addDoc(collection(db, 'jobs'), { ...payload, createdAt: Date.now(), createdBy: user.uid });
      }
      clearJobsCache();
      setShowForm(false);
      await fetchJobs();

      if (wasEditing && destTab !== view) {
        showToast(
          destTab === 'hold'
            ? 'Saved — this job is on hold, so it stays in the On Hold tab.'
            : destTab === 'expired'
              ? 'Saved — this job is now past its date and has moved to Expired.'
              : 'Saved — this job is live again and has moved to Active.',
        );
      }
    } catch (e) {
      console.error('Error saving job:', e);
      alert('Failed to save job. Check your permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id || !confirm('Delete this job? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'jobs', id));
      clearJobsCache();
      await fetchJobs();
    } catch (e) {
      console.error('Error deleting job:', e);
      alert('Failed to delete job.');
    }
  };

  /**
   * Says "live job(s)" on the Active tab. "Delete 40 selected job(s)?" reads
   * identically whether those are dead listings or the ones your users are
   * looking at, and that is the one place the wording should not be neutral.
   */
  const handleDeleteSelected = () =>
    deleteMany(selectedIds, view === 'active' ? 'live job(s)' : 'selected job(s)');
  const handleBulkDeleteExpired = () => deleteMany(deletableExpired.map((j) => j.id!), 'expired job(s)');

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Content</p>
          <h1 className="font-heading text-3xl font-bold text-zinc-900">Manage Jobs</h1>
        </div>
        {!showForm && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setShowImport(false); setShowExport((v) => !v); }} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={openImport} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">
              <Upload className="w-4 h-4" /> Import
            </button>
            <button onClick={openCreate} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> New Job
            </button>
          </div>
        )}
      </div>

      {/* ---- export panel ---- */}
      {showExport && !showForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-soft p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-zinc-900">Export Jobs</h2>
            <button onClick={() => setShowExport(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition" aria-label="Close export panel">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-zinc-500 mb-3">
            Filtered by <strong>date added</strong>, from the <strong>{view}</strong> tab.
            Every job has an added date, so nothing is silently dropped.
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {(['all', '7d', '30d', '90d', 'custom'] as RangeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setRangeMode(m)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  rangeMode === m ? 'bg-[#8b2df2] text-white' : 'bg-white text-zinc-600 border border-zinc-200 hover:border-[#8b2df2]/40'
                }`}
              >
                {m === 'all' ? 'All time' : m === 'custom' ? 'Custom' : `Last ${m.replace('d', '')} days`}
              </button>
            ))}
          </div>

          {rangeMode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="From">
                <input type="date" className={inputCls} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <input type="date" className={inputCls} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleExport}
              disabled={exportScope.length === 0}
              className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download {exportScope.length} job{exportScope.length === 1 ? '' : 's'}
            </button>
            {user?.role !== 'superadmin' && (
              <p className="text-xs text-zinc-400">Only your own jobs are exported — those are the ones you can re-import.</p>
            )}
          </div>
        </div>
      )}

      {showImport && !showForm && user && (
        <JobImportPanel
          existingJobs={jobs}
          uid={user.uid}
          isAdmin={user.role === 'superadmin'}
          onClose={() => setShowImport(false)}
          onImported={() => { fetchJobs(); fetchCategories(); }}
        />
      )}

      {showForm ? (
        <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-lg font-semibold text-zinc-900">{editingId ? 'Edit Job' : 'Create New Job'}</h2>
            <button onClick={() => setShowForm(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700"><X className="w-5 h-5" /></button>
          </div>

          {/* Hold is shown here but NOT edited here. The form has no hold fields,
              so saving cannot touch them — which is exactly why editing a held
              job to fix a typo is safe. Changing the hold is a separate,
              deliberate action from the list. */}
          {editingJob?.onHold && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
              <PauseCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs text-amber-900 leading-relaxed">
                <strong>On hold — “{editingJob.holdLabel || 'Update awaited'}”</strong>
                {editingJob.holdNote && <> · <span className="text-amber-800">{editingJob.holdNote}</span></>}
                <br />
                Saving here will not change that. Use Hold / Release in the job list.
              </div>
            </div>
          )}

          <div className="bg-[#8b2df2]/5 border border-[#8b2df2]/15 rounded-xl p-3 mb-5 text-xs text-zinc-600 leading-relaxed">
            <strong className="text-zinc-800">Formatting:</strong> use the toolbar for bold, italic, underline, bullet points and numbering.
            Pasted text keeps its line breaks and is cleaned of outside styling automatically.
          </div>

          <div className="space-y-4">
            <Field label="Job Title">
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. SSC CGL 2026 Notification" />
            </Field>

            <Field label="Reference Code (optional)">
              <input className={inputCls} value={form.refCode} onChange={(e) => setForm({ ...form, refCode: e.target.value })} placeholder="e.g. ssc-cgl-2026" />
              <p className="text-xs text-zinc-400 mt-1">
                Stable identity used by Import/Export. Leave blank and one is generated from the title, company and category.
              </p>
            </Field>

            <div className="sm:max-w-xs">
              <Field label="Category">
                <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {!form.category && <option value="">— Choose —</option>}
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                  {/* An existing job may sit in a category that has since been
                      disabled. Keep it selectable so editing anything else about
                      the job does not silently reassign it. */}
                  {form.category && !activeCategories.some((c) => c.id === form.category) && (
                    <option value={form.category}>{labelForCategory(categories, form.category)} (disabled)</option>
                  )}
                </select>
              </Field>
            </div>

            <Field label="Age Limit">
              <RichTextEditor
                key={`${formKey}-age`}
                value={form.ageLimit}
                onChange={(html) => setForm((f) => ({ ...f, ageLimit: html }))}
                placeholder="e.g. 18-30 years. AGE: 40 years for UR/EWS, 43 for OBC, 45 for SC/ST."
                minHeight={90}
              />
            </Field>

            <div className="pt-2 border-t border-zinc-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Card details (shown on the job card — all optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company / Organisation name">
                  <input className={inputCls} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Google, SSC" />
                </Field>
                <Field label="Company logo URL (blank = auto letter tile)">
                  <input className={inputCls} value={form.companyLogo} onChange={(e) => setForm({ ...form, companyLogo: e.target.value })} placeholder="https://i.ibb.co/..." />
                </Field>
                <Field label="Salary / Pay (blank = hidden)">
                  <input className={inputCls} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 15 - 25 LPA" />
                </Field>
                <Field label="Experience (blank = hidden)">
                  <input className={inputCls} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="e.g. 2 - 5 Yrs" />
                </Field>
                <Field label="Location (blank = hidden)">
                  <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bangalore, India" />
                </Field>
                <Field label="Work mode (blank = hidden)">
                  <select className={inputCls} value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value as WorkMode | '' })}>
                    <option value="">— None —</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Skills (comma-separated, blank = hidden)">
                  <input className={inputCls} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="e.g. Python, C++, React" />
                </Field>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Notification Date">
                  <input type="date" className={inputCls} value={dateToInput(form.notificationDate)} onChange={(e) => setForm({ ...form, notificationDate: inputToTimestamp(e.target.value) })} />
                </Field>
                <Field label="Application Start">
                  <input type="date" className={inputCls} value={dateToInput(form.applicationStartDate)} onChange={(e) => setForm({ ...form, applicationStartDate: inputToTimestamp(e.target.value) })} />
                </Field>
                <Field label="Application End">
                  <input type="date" className={inputCls} value={dateToInput(form.applicationEndDate)} onChange={(e) => setForm({ ...form, applicationEndDate: inputToTimestamp(e.target.value) })} />
                </Field>
                <Field label="Exam Date (optional)">
                  <input type="date" className={inputCls} value={dateToInput(form.examDate)} onChange={(e) => setForm({ ...form, examDate: inputToTimestamp(e.target.value) })} />
                </Field>
              </div>

              <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600 leading-relaxed">
                <strong className="text-zinc-800">How long this listing stays live:</strong>{' '}
                {form.examDate
                  ? <>until the <strong>exam date</strong> ({formatDate(form.examDate)}), even after applications close. The application end date is still shown to users exactly as entered.</>
                  : form.applicationEndDate
                    ? <>until the <strong>application end date</strong> ({formatDate(form.applicationEndDate)}). Add an exam date to keep it live past that.</>
                    : <>no dates set — it will expire 30 days after being added.</>}
                <br />
                For a multi-stage exam, enter the <strong>last</strong> stage you know of.
                Leave it blank if the date has not been announced.
              </div>

              {form.examDate !== null && form.examDate + 24 * 60 * 60 * 1000 <= Date.now() && (
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  That exam date has already passed, so this job will move straight to Expired. Check the year if that was not intended.
                </div>
              )}
            </div>

            <Field label="Educational Qualification">
              <RichTextEditor
                key={`${formKey}-edu`}
                value={form.educationalQualification}
                onChange={(html) => setForm((f) => ({ ...f, educationalQualification: html }))}
                placeholder="Paste the vacancy details here — line breaks and numbering are preserved."
                minHeight={200}
              />
            </Field>

            <div className="pt-2 border-t border-zinc-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Premium content (visible to subscribers)</p>
              <Field label="Exam Details">
                <RichTextEditor
                  key={`${formKey}-exam`}
                  value={form.examDetails}
                  onChange={(html) => setForm((f) => ({ ...f, examDetails: html }))}
                  placeholder="Exam pattern, syllabus, marks, duration..."
                  minHeight={150}
                />
              </Field>
              <div className="mt-4">
                <Field label="Study Material">
                  <RichTextEditor
                    key={`${formKey}-study`}
                    value={form.studyMaterial}
                    onChange={(html) => setForm((f) => ({ ...f, studyMaterial: html }))}
                    placeholder="Recommended books, links, tips..."
                    minHeight={150}
                  />
                </Field>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Custom Sections</p>
                <button onClick={addSection} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Section</button>
              </div>
              <div className="space-y-3">
                {form.customSections.map((section, i) => (
                  <div key={`${sectionsKey}-${i}`} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                    <div className="flex items-center gap-2 mb-2">
                      <input className={inputCls + ' flex-1 min-w-0'} value={section.title} onChange={(e) => updateSection(i, 'title', e.target.value)} placeholder="Section title" />
                      <button onClick={() => removeSection(i)} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <RichTextEditor
                      key={`${formKey}-${sectionsKey}-sec-${i}`}
                      value={section.content}
                      onChange={(html) => updateSection(i, 'content', html)}
                      placeholder="Section content"
                      minHeight={120}
                    />
                  </div>
                ))}
                {form.customSections.length === 0 && (
                  <p className="text-sm text-zinc-400">No custom sections. Add one for extra info like selection process, fees, etc.</p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Link Buttons</p>
                <button onClick={addButton} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Button</button>
              </div>
              <p className="text-xs text-zinc-400 mb-3">Informational links shown on the details page for subscribers (e.g. "Official Notification", "Official Website"). Put only the URL in the link field — pasting the label and URL together makes the button disappear.</p>
              <div className="space-y-3">
                {form.linkButtons.map((btn, i) => (
                  <div key={i} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <input className={inputCls + ' flex-1 min-w-0'} value={btn.text} onChange={(e) => updateButton(i, 'text', e.target.value)} placeholder="Button text (e.g. Official Notification)" />
                      <button onClick={() => moveButton(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => moveButton(i, 1)} disabled={i === form.linkButtons.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      <button onClick={() => removeButton(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <input className={inputCls + ' flex-1 min-w-0'} value={btn.url} onChange={(e) => updateButton(i, 'url', e.target.value)} placeholder="https://... (link to open)" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Button color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={btn.bgColor} onChange={(e) => updateButton(i, 'bgColor', e.target.value)} className="w-9 h-9 rounded-lg border border-zinc-200 bg-white cursor-pointer p-0.5 shrink-0" />
                          <input className={inputCls} value={btn.bgColor} onChange={(e) => updateButton(i, 'bgColor', e.target.value)} placeholder="#8b2df2" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Text color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={btn.textColor} onChange={(e) => updateButton(i, 'textColor', e.target.value)} className="w-9 h-9 rounded-lg border border-zinc-200 bg-white cursor-pointer p-0.5 shrink-0" />
                          <input className={inputCls} value={btn.textColor} onChange={(e) => updateButton(i, 'textColor', e.target.value)} placeholder="#ffffff" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-1">
                      <span className="text-xs text-zinc-400">Preview: </span>
                      <span className="inline-flex items-center px-4 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: btn.bgColor, color: btn.textColor }}>{btn.text || 'Button'}</span>
                    </div>
                  </div>
                ))}
                {form.linkButtons.length === 0 && (
                  <p className="text-sm text-zinc-400">No buttons yet. Add one to link users to official notifications, websites, etc.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Update Job' : 'Create Job'}
              </button>
              <button onClick={() => setShowForm(false)} className="text-sm font-medium text-zinc-500 hover:text-zinc-800 px-3 py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedIds([]); }}
              placeholder="Search by title, company, location or reference code..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="inline-flex bg-white rounded-xl p-1 shadow-soft">
              <button onClick={() => switchView('active')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'active' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                Active ({search ? filteredActive.length : activeJobs.length})
              </button>
              <button onClick={() => switchView('expired')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'expired' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                Expired ({search ? filteredExpired.length : expiredJobs.length})
              </button>
              {/* Always rendered, even at zero, so the tab is discoverable
                  before you have ever used it. */}
              <button onClick={() => switchView('hold')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'hold' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                On Hold ({search ? filteredHeld.length : heldJobs.length})
              </button>
            </div>
            {selectable.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-600 bg-white rounded-xl px-3 py-2 shadow-soft cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" />
                  Select all ({selectable.length})
                </label>
                {selectedIds.length > 0 && (
                  <button onClick={handleDeleteSelected} disabled={bulkDeleting} className="inline-flex items-center gap-2 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                    {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete Selected ({selectedIds.length})
                  </button>
                )}
                {/* Deliberately Expired-only. A held job can be deleted one by
                    one or by selection, but never swept — that is the whole
                    reason the tab exists. */}
                {view === 'expired' && (
                  <button onClick={handleBulkDeleteExpired} disabled={bulkDeleting} className="inline-flex items-center gap-2 border-2 border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-50">
                    Delete All{search ? ' Shown' : ' Expired'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Matches in the tab you are not looking at. */}
          {search.trim() && otherTabMatches > 0 && (
            <div className="mb-4 text-sm text-zinc-500">
              {otherTabMatches} more match{otherTabMatches === 1 ? '' : 'es'} in{' '}
              {otherTabs.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && (i === otherTabs.length - 1 ? ' and ' : ', ')}
                  <button onClick={() => switchView(t.id)} className="font-semibold text-[#8b2df2] hover:underline">
                    {t.label} ({t.count})
                  </button>
                </span>
              ))}
            </div>
          )}

          {view === 'expired' && expiredJobs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Past their exam date, or their application deadline where no exam date is set (or 30+ days old with no dates).
                Users still see them until you delete them — and a postponed exam can be brought back to Active just by editing its date.
                If a listing still matters because a result or interview is pending, put it <strong>On Hold</strong> instead: it moves to its own tab and "Delete All Expired" can no longer reach it.
              </span>
            </div>
          )}

          {view === 'hold' && heldJobs.length > 0 && (
            <div className={`rounded-xl p-3 mb-4 flex items-start gap-2 text-sm border ${staleHolds.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-zinc-200 text-zinc-600'}`}>
              <PauseCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {heldJobs.length} job{heldJobs.length === 1 ? '' : 's'} kept out of Expired on purpose — "Delete All Expired" cannot touch them.
                Oldest hold first.
                {staleHolds.length > 0 && (
                  <> <strong>{staleHolds.length} {staleHolds.length === 1 ? 'has' : 'have'} been held over {STALE_HOLD_DAYS} days</strong> — worth checking whether {staleHolds.length === 1 ? 'it is' : 'they are'} still needed.</>
                )}
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
          ) : shownJobs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
              <Briefcase className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">
                {search.trim()
                  ? 'No jobs here match that search.'
                  : view === 'active'
                    ? 'No active jobs. Click "New Job" to create one.'
                    : view === 'expired'
                      ? 'No expired jobs. Your listings are all current.'
                      : 'Nothing on hold. Use Hold on an expired job to keep it out of the bulk-delete sweep.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {shownJobs.map((job) => {
                const stage = getJobStage(job);
                return (
                  <div key={job.id} className={`bg-white rounded-2xl shadow-soft p-4 sm:p-5 flex items-start justify-between gap-4 ${job.id && selectedIds.includes(job.id) ? 'ring-2 ring-red-300' : ''}`}>
                    {canDelete(job) && (
                      <input
                        type="checkbox"
                        checked={!!job.id && selectedIds.includes(job.id)}
                        onChange={() => toggleSelect(job.id)}
                        className="mt-1 rounded shrink-0"
                        aria-label={`Select ${job.title}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full border"
                          style={categoryBadgeStyle(colorForCategory(categories, job.category))}
                        >
                          {labelForCategory(categories, job.category)}
                        </span>
                        {/* Shows WHICH date is governing this job's life, so the
                            tab it sits in is never a mystery. */}
                        {job.examDate ? (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                            <CalendarCheck className="w-3 h-3" /> Exam: {formatDate(job.examDate)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">Ends: {formatDate(job.applicationEndDate) || '—'}</span>
                        )}
                        {stage.label && (
                          <span className={`text-xs ${STAGE_TEXT_CLASS[stage.tone]}`}>· {stage.label}</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-zinc-900 truncate">{job.title}</h3>
                      <p className="text-xs text-zinc-400 mt-1">Added {formatDate(job.createdAt)}</p>
                      {/* Hold detail, only where it is the point. The age is the
                          drift alarm: a hold with no end date needs SOMETHING
                          telling you how long it has been sitting there. */}
                      {job.onHold && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs">
                          <Clock className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${holdAgeDays(job.heldAt) >= STALE_HOLD_DAYS ? 'text-amber-600' : 'text-zinc-400'}`} />
                          <span className="min-w-0">
                            <span className={holdAgeDays(job.heldAt) >= STALE_HOLD_DAYS ? 'font-semibold text-amber-700' : 'text-zinc-500'}>
                              {heldAgo(job.heldAt)}
                            </span>
                            {job.holdNote && <span className="text-zinc-400"> · {job.holdNote}</span>}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Edit is now offered in BOTH tabs. A postponed exam sits
                          in Expired, and updating its date is exactly how you
                          bring it back — it re-buckets itself on the next load. */}
                      {/* Hold on an expired job; Edit-hold / Release once held.
                          Not offered in Active: holding a live listing would be
                          a no-op you could only discover by looking. */}
                      {canHold && view === 'expired' && (
                        <button onClick={() => openHold(job)} className="p-2 text-zinc-400 hover:text-amber-600" title="Put on hold (keeps it out of Delete All Expired)">
                          <PauseCircle className="w-4 h-4" />
                        </button>
                      )}
                      {canHold && job.onHold && (
                        <>
                          <button onClick={() => openHold(job)} className="p-2 text-zinc-400 hover:text-amber-600" title="Edit hold label / note">
                            <PauseCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleRelease(job)} disabled={bulkDeleting} className="p-2 text-zinc-400 hover:text-emerald-600 disabled:opacity-40" title="Release from hold">
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {canDelete(job) && <button onClick={() => openEdit(job)} className="p-2 text-zinc-400 hover:text-[#8b2df2]" title="Edit"><Pencil className="w-4 h-4" /></button>}
                      {canDelete(job) && <button onClick={() => handleDelete(job.id)} className="p-2 text-zinc-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---- hold dialog ---- */}
      {holdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeHold} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold text-zinc-900">
                  {holdTarget.onHold ? 'Edit hold' : 'Put on hold'}
                </h2>
                <p className="text-sm text-zinc-500 truncate">{holdTarget.title}</p>
              </div>
              <button onClick={closeHold} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <Field label="Status label (shown publicly on the job card)">
                <input
                  className={inputCls}
                  value={holdLabelInput}
                  maxLength={HOLD_LABEL_MAX}
                  onChange={(e) => setHoldLabelInput(e.target.value)}
                  placeholder="e.g. Result awaited"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1 gap-3">
                  <p className="text-xs text-zinc-400">
                    Replaces “Completed” on the card. Users see this, so keep it public-safe.
                  </p>
                  <span className="text-xs text-zinc-400 shrink-0">{holdLabelInput.length}/{HOLD_LABEL_MAX}</span>
                </div>
              </Field>

              <Field label="Private note (optional — admins only)">
                <input
                  className={inputCls}
                  value={holdNoteInput}
                  onChange={(e) => setHoldNoteInput(e.target.value)}
                  placeholder="e.g. chase SSC helpdesk in August"
                />
                <p className="text-xs text-zinc-400 mt-1">Never shown to users. Only appears in this list.</p>
              </Field>

              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600 leading-relaxed">
                A held job leaves the Expired tab, so <strong>“Delete All Expired” cannot reach it</strong>.
                Its dates are not changed. Release it at any time and it returns to Active or Expired
                depending on those dates.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-5">
              <button
                onClick={confirmHold}
                disabled={holdSaving || !holdLabelInput.trim()}
                className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {holdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
                {holdTarget.onHold ? 'Save hold' : 'Put on hold'}
              </button>
              <button onClick={closeHold} className="text-sm font-medium text-zinc-500 hover:text-zinc-800 px-3 py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md text-center px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 bg-zinc-900 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}