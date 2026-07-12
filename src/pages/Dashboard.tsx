import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Job, JobCategory } from '../types';
import { categoryBadgeClass, categoryLabel, formatDate } from '../lib/format';
import { Search, Bookmark, BookmarkCheck, Loader2, Calendar, ArrowRight, Briefcase } from 'lucide-react';

const CATEGORIES: (JobCategory | 'all')[] = ['all', 'government', 'corporate', 'internship'];

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
      // Jobs
      const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: Job[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Job) }));
      setJobs(list);

      // Saved jobs (this user's cart)
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
    if (!user) return;
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
      const matchSearch = !search.trim() || job.title.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [jobs, filter, search]);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Opportunities</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">Latest Jobs</h1>
        <p className="text-zinc-500 mt-1">Browse the newest notifications. Tap a job for full details.</p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs..."
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
        <div className="grid gap-3">
          {visibleJobs.map((job) => {
            const isSaved = savedIds.includes(job.id || '');
            return (
              <div key={job.id} className="bg-white rounded-2xl shadow-soft hover:shadow-soft-hover transition p-5 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass(job.category)}`}>{categoryLabel(job.category)}</span>
                      {job.applicationEndDate && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                          <Calendar className="w-3 h-3" /> Last date: {formatDate(job.applicationEndDate)}
                        </span>
                      )}
                    </div>
                    <Link to={`/job/${job.id}`} className="block">
                      <h3 className="font-semibold text-zinc-900 text-lg leading-snug group-hover:text-[#8b2df2] transition">{job.title}</h3>
                    </Link>
                    {job.educationalQualification && (
                      <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{job.educationalQualification}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleSave(job.id || '')}
                    disabled={savingId === job.id}
                    className={`p-2 rounded-lg transition shrink-0 ${isSaved ? 'text-[#8b2df2]' : 'text-zinc-300 hover:text-zinc-500'}`}
                    title={isSaved ? 'Remove from saved' : 'Save job'}
                  >
                    {savingId === job.id ? <Loader2 className="w-5 h-5 animate-spin" /> : isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-50 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Age limit: {job.ageLimit || '—'}</span>
                  <Link to={`/job/${job.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:gap-2 transition-all">
                    View details <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}