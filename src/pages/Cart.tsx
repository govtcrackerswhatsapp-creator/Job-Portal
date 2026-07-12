import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJob } from '../lib/jobsData';
import { Job } from '../types';
import { categoryBadgeClass, categoryLabel, formatDate } from '../lib/format';
import { Bookmark, Trash2, Loader2, ArrowRight, Calendar, Users } from 'lucide-react';

export default function Cart() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const cartSnap = await getDoc(doc(db, 'carts', user.uid));
      const ids: string[] = cartSnap.exists() ? (cartSnap.data().jobIds as string[]) || [] : [];
      setSavedIds(ids);

      if (ids.length === 0) {
        setJobs([]);
        return;
      }
      const fetched: Job[] = [];
      for (const id of ids) {
        const j = await getJob(id); // cached
        if (j) fetched.push(j);
      }
      setJobs(fetched);
    } catch (e) {
      console.error('Error loading saved jobs:', e);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (jobId: string) => {
    if (!user) return;
    const next = savedIds.filter((id) => id !== jobId);
    await setDoc(doc(db, 'carts', user.uid), { jobIds: next });
    setSavedIds(next);
    setJobs(jobs.filter((j) => j.id !== jobId));
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Shortlist</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">My Saved Jobs</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
          <Bookmark className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 mb-4">You haven't saved any jobs yet.</p>
          <Link to="/dashboard" className="text-[#8b2df2] font-medium hover:underline">Browse jobs →</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl shadow-soft p-5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass(job.category)}`}>{categoryLabel(job.category)}</span>
                  {job.applicationEndDate && (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                      <Calendar className="w-3 h-3" /> Last date: {formatDate(job.applicationEndDate)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                    <Users className="w-3 h-3" /> Age: {job.ageLimit || '—'}
                  </span>
                </div>
                <Link to={`/job/${job.id}`}>
                  <h3 className="font-semibold text-zinc-900 hover:text-[#8b2df2] transition">{job.title}</h3>
                </Link>
                <Link to={`/job/${job.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] mt-2 hover:gap-2 transition-all">
                  View details <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <button onClick={() => remove(job.id || '')} className="p-2 text-zinc-300 hover:text-red-600 transition shrink-0" title="Remove">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}