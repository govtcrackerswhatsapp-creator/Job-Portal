import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJobs } from '../lib/jobsData';
import { getCategories } from '../lib/categoriesData';
import { Job, Category } from '../types';
import JobCard from '../components/JobCard';
import CategoryFilter from '../components/CategoryFilter';
import { Search, Loader2, Briefcase, X } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Empty means every category. There is no 'all' entry — see CategoryFilter. */
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    try {
      setLoading(true);
      // Both are cached, and independent of each other, so run them together.
      const [list, cats] = await Promise.all([getJobs(), getCategories()]);
      setJobs(list);

      /**
       * ALL categories, including disabled ones — not getActiveCategories().
       * Disabling a category stops NEW jobs landing in it; the jobs already
       * there must stay findable. Filtering the list here would strand them
       * where only "everything" reaches them.
       */
      setCategories(cats);

      if (user) {
        const cartSnap = await getDoc(doc(db, 'carts', user.uid));
        if (cartSnap.exists()) {
          setSavedIds((cartSnap.data().jobIds as string[]) || []);
        }
      }
    } catch (e) {
      console.error('Error loading dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSave = async (jobId: string) => {
    if (!user || !jobId) return;
    try {
      setSavingId(jobId);
      const next = savedIds.includes(jobId) ? savedIds.filter((id) => id !== jobId) : [...savedIds, jobId];
      await setDoc(doc(db, 'carts', user.uid), { jobIds: next });
      setSavedIds(next);
    } catch (e) {
      console.error('Error saving job:', e);
    } finally {
      setSavingId(null);
    }
  };

  /** Job count per category id, shown beside each row in the filter. */
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    jobs.forEach((j) => { m[j.category] = (m[j.category] || 0) + 1; });
    return m;
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchCat = selectedCats.length === 0 || selectedCats.indexOf(job.category) !== -1;
      const term = search.trim().toLowerCase();
      const matchSearch = !term ||
        job.title.toLowerCase().includes(term) ||
        (job.companyName || '').toLowerCase().includes(term) ||
        (job.location || '').toLowerCase().includes(term) ||
        (job.skills || []).some((s) => s.toLowerCase().includes(term));
      return matchCat && matchSearch;
    });
  }, [jobs, selectedCats, search]);

  const filtering = selectedCats.length > 0 || search.trim().length > 0;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Opportunities</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">Latest Jobs</h1>
        <p className="text-zinc-500 mt-1">Browse the newest notifications. Tap a job for full details.</p>
      </div>

      {/* Search + category filter. The old horizontal chip row is gone: it ran
          out of width as soon as categories became editable, and a scrolling
          strip of eight chips is worse than one control that says what it is
          filtering. */}
      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, company, location, skill..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="shrink-0">
          <CategoryFilter
            categories={categories}
            selected={selectedCats}
            onChange={setSelectedCats}
            counts={categoryCounts}
          />
        </div>
      </div>

      {/* Result count, only while something is actually filtering. Without it a
          multi-select filter makes a short list look like a broken page. */}
      {!loading && filtering && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <p className="text-sm text-zinc-500">
            {visibleJobs.length} of {jobs.length} job{jobs.length === 1 ? '' : 's'}
          </p>
          <button
            onClick={() => { setSelectedCats([]); setSearch(''); }}
            className="text-sm font-medium text-[#8b2df2] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
      ) : visibleJobs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
          <Briefcase className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 mb-4">{jobs.length === 0 ? 'No jobs posted yet. Check back soon!' : 'No jobs match your filters.'}</p>
          {jobs.length > 0 && filtering && (
            <button
              onClick={() => { setSelectedCats([]); setSearch(''); }}
              className="text-[#8b2df2] font-medium hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleJobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              index={i}
              user={user}
              isSaved={savedIds.includes(job.id || '')}
              onToggleSave={toggleSave}
              savingId={savingId}
              categories={categories}
            />
          ))}
        </div>
      )}
    </div>
  );
}