import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getJob } from '../lib/jobsData';
import { Job } from '../types';
import JobCard from '../components/JobCard';
import { Bookmark, Loader2 } from 'lucide-react';

export default function Cart() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  // On the saved page, toggling always removes (they're all saved here).
  const toggleSave = async (jobId: string) => {
    if (!user || !jobId) return;
    try {
      setSavingId(jobId);
      const next = savedIds.filter((id) => id !== jobId);
      await setDoc(doc(db, 'carts', user.uid), { jobIds: next });
      setSavedIds(next);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (e) {
      console.error('Error removing saved job:', e);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              index={i}
              user={user}
              isSaved={true}
              onToggleSave={toggleSave}
              savingId={savingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}