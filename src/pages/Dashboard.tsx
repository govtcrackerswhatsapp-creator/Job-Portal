import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJobs } from '../lib/jobsData';
import { Job, JobCategory } from '../types';
import { categoryLabel } from '../lib/format';
import JobCard from '../components/JobCard';
import { Search, Loader2, Briefcase } from 'lucide-react';

const CATEGORIES: (JobCategory | 'all')[] = ['all', 'government', 'corporate', 'internship', 'exam'];

export default function Dashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    try {
      setLoading(true);
      const list = await getJobs(); // cached
      setJobs(list);

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

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchCat = filter === 'all' || job.category === filter;
      const term = search.trim().toLowerCase();
      const matchSearch = !term ||
        job.title.toLowerCase().includes(term) ||
        (job.companyName || '').toLowerCase().includes(term) ||
        (job.location || '').toLowerCase().includes(term) ||
        (job.skills || []).some((s) => s.toLowerCase().includes(term));
      return matchCat && matchSearch;
    });
  }, [jobs, filter, search]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Opportunities</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">Latest Jobs</h1>
        <p className="text-zinc-500 mt-1">Browse the newest notifications. Tap a job for full details.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, company, location, skill..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                filter === cat ? 'bg-[#8b2df2] text-white' : 'bg-white text-zinc-600 border border-zinc-200 hover:border-[#8b2df2]/40'
              }`}
            >
              {cat === 'all' ? 'All' : categoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
      ) : visibleJobs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
          <Briefcase className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500">{jobs.length === 0 ? 'No jobs posted yet. Check back soon!' : 'No jobs match your filters.'}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleJobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              index={i}
              user={user}
              isSaved={savedIds.includes(job.id || '')}
              onToggleSave={toggleSave}
              savingId={savingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}