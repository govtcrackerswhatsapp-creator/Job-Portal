import { useEffect, useState, ReactNode, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJobs, clearJobsCache } from '../lib/jobsData';
import { Job, JobCategory, JobSection } from '../types';
import { categoryBadgeClass, categoryLabel, formatDate } from '../lib/format';
import { Plus, Pencil, Trash2, X, Loader2, Save, Briefcase, AlertTriangle } from 'lucide-react';

interface JobFormState {
  title: string;
  category: JobCategory;
  ageLimit: string;
  notificationDate: number | null;
  applicationStartDate: number | null;
  applicationEndDate: number | null;
  educationalQualification: string;
  examDetails: string;
  studyMaterial: string;
  customSections: JobSection[];
}

const EMPTY_JOB: JobFormState = {
  title: '', category: 'government', ageLimit: '',
  notificationDate: null, applicationStartDate: null, applicationEndDate: null,
  educationalQualification: '', examDetails: '', studyMaterial: '', customSections: [],
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

function dateToInput(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function inputToTimestamp(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value + 'T00:00:00').getTime();
  return isNaN(ms) ? null : ms;
}

// A job is "expired" if its end date has passed, OR it has no end date and was created 30+ days ago.
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
function isExpired(job: Job): boolean {
  const now = Date.now();
  if (job.applicationEndDate) return job.applicationEndDate < now;
  return job.createdAt < now - THIRTY_DAYS;
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<JobFormState>({ ...EMPTY_JOB });
  const [view, setView] = useState<'active' | 'expired'>('active');
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => { fetchJobs(); }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const list = await getJobs(true); // force-fresh for the management view (also refreshes cache)
      setJobs(list);
    } catch (e) {
      console.error('Error fetching jobs:', e);
    } finally {
      setLoading(false);
    }
  };

  const activeJobs = useMemo(() => jobs.filter((j) => !isExpired(j)), [jobs]);
  const expiredJobs = useMemo(() => jobs.filter((j) => isExpired(j)), [jobs]);
  const shownJobs = view === 'active' ? activeJobs : expiredJobs;

  const openCreate = () => { setForm({ ...EMPTY_JOB }); setEditingId(null); setShowForm(true); };
  const openEdit = (job: Job) => {
    setForm({
      title: job.title, category: job.category, ageLimit: job.ageLimit,
      notificationDate: job.notificationDate ?? null, applicationStartDate: job.applicationStartDate ?? null, applicationEndDate: job.applicationEndDate ?? null,
      educationalQualification: job.educationalQualification, examDetails: job.examDetails || '', studyMaterial: job.studyMaterial || '',
      customSections: job.customSections ? [...job.customSections] : [],
    });
    setEditingId(job.id || null);
    setShowForm(true);
  };

  const addSection = () => setForm({ ...form, customSections: [...form.customSections, { title: '', content: '' }] });
  const updateSection = (i: number, field: keyof JobSection, value: string) => {
    const sections = [...form.customSections];
    sections[i] = { ...sections[i], [field]: value };
    setForm({ ...form, customSections: sections });
  };
  const removeSection = (i: number) => {
    const sections = [...form.customSections];
    sections.splice(i, 1);
    setForm({ ...form, customSections: sections });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.title.trim()) { alert('Please enter a job title.'); return; }
    try {
      setSaving(true);
      const cleanSections = form.customSections.filter((s) => s.title.trim() || s.content.trim());
      const payload = { ...form, customSections: cleanSections };
      if (editingId) {
        await updateDoc(doc(db, 'jobs', editingId), payload as any);
      } else {
        await addDoc(collection(db, 'jobs'), { ...payload, createdAt: Date.now(), createdBy: user.uid });
      }
      clearJobsCache();
      setShowForm(false);
      await fetchJobs();
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

  const handleBulkDeleteExpired = async () => {
    if (expiredJobs.length === 0) return;
    if (!confirm(`Delete ALL ${expiredJobs.length} expired jobs? This cannot be undone.`)) return;
    try {
      setBulkDeleting(true);
      for (const job of expiredJobs) {
        if (job.id) await deleteDoc(doc(db, 'jobs', job.id));
      }
      clearJobsCache();
      await fetchJobs();
    } catch (e) {
      console.error('Error bulk deleting:', e);
      alert('Some jobs could not be deleted.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Content</p>
          <h1 className="font-heading text-3xl font-bold text-zinc-900">Manage Jobs</h1>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> New Job
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-2xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-lg font-semibold text-zinc-900">{editingId ? 'Edit Job' : 'Create New Job'}</h2>
            <button onClick={() => setShowForm(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-4">
            <Field label="Job Title">
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. SSC CGL 2026 Notification" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Category">
                <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as JobCategory })}>
                  <option value="government">Government</option>
                  <option value="corporate">Corporate</option>
                  <option value="internship">Internship</option>
                </select>
              </Field>
              <Field label="Age Limit">
                <input className={inputCls} value={form.ageLimit} onChange={(e) => setForm({ ...form, ageLimit: e.target.value })} placeholder="e.g. 18-30 years" />
              </Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Notification Date">
                <input type="date" className={inputCls} value={dateToInput(form.notificationDate)} onChange={(e) => setForm({ ...form, notificationDate: inputToTimestamp(e.target.value) })} />
              </Field>
              <Field label="Application Start">
                <input type="date" className={inputCls} value={dateToInput(form.applicationStartDate)} onChange={(e) => setForm({ ...form, applicationStartDate: inputToTimestamp(e.target.value) })} />
              </Field>
              <Field label="Application End">
                <input type="date" className={inputCls} value={dateToInput(form.applicationEndDate)} onChange={(e) => setForm({ ...form, applicationEndDate: inputToTimestamp(e.target.value) })} />
              </Field>
            </div>
            <Field label="Educational Qualification">
              <textarea className={inputCls} rows={2} value={form.educationalQualification} onChange={(e) => setForm({ ...form, educationalQualification: e.target.value })} placeholder="e.g. Bachelor's degree in any discipline" />
            </Field>
            <div className="pt-2 border-t border-zinc-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Premium content (visible to subscribers)</p>
              <Field label="Exam Details">
                <textarea className={inputCls} rows={3} value={form.examDetails} onChange={(e) => setForm({ ...form, examDetails: e.target.value })} placeholder="Exam pattern, syllabus, dates..." />
              </Field>
              <div className="mt-4">
                <Field label="Study Material">
                  <textarea className={inputCls} rows={3} value={form.studyMaterial} onChange={(e) => setForm({ ...form, studyMaterial: e.target.value })} placeholder="Recommended books, links, tips..." />
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
                  <div key={i} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                    <div className="flex items-center gap-2 mb-2">
                      <input className={inputCls + ' flex-1'} value={section.title} onChange={(e) => updateSection(i, 'title', e.target.value)} placeholder="Section title" />
                      <button onClick={() => removeSection(i)} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea className={inputCls} rows={2} value={section.content} onChange={(e) => updateSection(i, 'content', e.target.value)} placeholder="Section content" />
                  </div>
                ))}
                {form.customSections.length === 0 && (
                  <p className="text-sm text-zinc-400">No custom sections. Add one for extra info like selection process, fees, etc.</p>
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
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="inline-flex bg-white rounded-xl p-1 shadow-soft">
              <button onClick={() => setView('active')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'active' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                Active ({activeJobs.length})
              </button>
              <button onClick={() => setView('expired')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'expired' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                Expired ({expiredJobs.length})
              </button>
            </div>
            {view === 'expired' && expiredJobs.length > 0 && (
              <button onClick={handleBulkDeleteExpired} disabled={bulkDeleting} className="inline-flex items-center gap-2 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete All Expired
              </button>
            )}
          </div>

          {view === 'expired' && expiredJobs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              These jobs are past their deadline (or 30+ days old with no deadline). Users still see them until you delete them.
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
          ) : shownJobs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
              <Briefcase className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">{view === 'active' ? 'No active jobs. Click "New Job" to create one.' : 'No expired jobs. Your listings are all current.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shownJobs.map((job) => (
                <div key={job.id} className="bg-white rounded-2xl shadow-soft p-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass(job.category)}`}>{categoryLabel(job.category)}</span>
                      <span className="text-xs text-zinc-400">Ends: {formatDate(job.applicationEndDate) || '—'}</span>
                    </div>
                    <h3 className="font-semibold text-zinc-900 truncate">{job.title}</h3>
                    <p className="text-xs text-zinc-400 mt-1">Added {formatDate(job.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {view === 'active' && <button onClick={() => openEdit(job)} className="p-2 text-zinc-400 hover:text-[#8b2df2]"><Pencil className="w-4 h-4" /></button>}
                    <button onClick={() => handleDelete(job.id)} className="p-2 text-zinc-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}