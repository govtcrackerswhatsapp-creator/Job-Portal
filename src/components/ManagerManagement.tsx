import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { Loader2, Search, UserCheck, UserX, Ban, Play, ShieldCheck, X, UserPlus } from 'lucide-react';

export default function ManagerManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push(d.data() as UserProfile));
      setUsers(list);
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setLoading(false);
    }
  };

  // Current managers (including suspended ones, who are stored as role 'user' + suspended flag we track via a marker)
  const managers = useMemo(() => users.filter((u) => u.role === 'manager'), [users]);

  // Search results for adding — any non-manager, non-superadmin user
  const searchMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return users.filter((u) => u.email.toLowerCase().includes(term) && u.role !== 'manager' && u.role !== 'superadmin').slice(0, 5);
  }, [users, search]);

  const makeManager = async (u: UserProfile) => {
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), { role: 'manager', suspended: false });
      await load();
      setShowAdd(false);
      setSearch('');
    } catch (e) {
      console.error('Error making manager:', e);
      alert('Failed to promote user.');
    } finally {
      setActing(null);
    }
  };

  const removeManager = async (u: UserProfile) => {
    if (!confirm(`Remove ${u.email} as manager? They become a regular user.`)) return;
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), { role: 'user', suspended: false });
      setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, role: 'user', suspended: false } : x)));
    } catch (e) {
      console.error('Error removing manager:', e);
      alert('Failed to remove manager.');
    } finally {
      setActing(null);
    }
  };

  const toggleSuspend = async (u: UserProfile) => {
    const suspending = !u.suspended;
    if (suspending && !confirm(`Suspend ${u.email}? They temporarily lose manager access until you un-suspend them.`)) return;
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), { suspended: suspending });
      setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, suspended: suspending } : x)));
    } catch (e) {
      console.error('Error toggling suspend:', e);
      alert('Failed to update suspension.');
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-heading text-lg font-semibold text-zinc-900">Managers ({managers.length})</h2>
        <button onClick={() => setShowAdd((s) => !s)} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition">
          <UserPlus className="w-4 h-4" /> Add Manager
        </button>
      </div>

      {/* Add manager tool */}
      {showAdd && (
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-zinc-900">Add a manager by email</h3>
            <button onClick={() => setShowAdd(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-zinc-500 mb-3">The person must have signed in to the app at least once to appear here.</p>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user email..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
          </div>
          {search.trim() && (
            <div className="space-y-2">
              {searchMatches.length === 0 ? (
                <p className="text-sm text-zinc-400">No eligible users found. They need to sign in once first.</p>
              ) : searchMatches.map((u) => (
                <div key={u.uid} className="bg-white rounded-lg p-3 border border-zinc-100 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{u.name || 'User'}</p>
                    <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                  </div>
                  <button onClick={() => makeManager(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium bg-[#8b2df2] text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 shrink-0">
                    {acting === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Make Manager
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manager list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>
      ) : managers.length === 0 ? (
        <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-100">
          <ShieldCheck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">No managers yet. Add trusted people to help post jobs.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {managers.map((u) => (
            <div key={u.uid} className="bg-white rounded-xl p-4 border border-zinc-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8b2df2] to-[#00b4d8] flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-900 truncate">{u.name || 'Manager'}</p>
                    {u.suspended && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Suspended</span>}
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleSuspend(u)} disabled={acting === u.uid} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 ${u.suspended ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  {u.suspended ? <><Play className="w-3.5 h-3.5" /> Un-suspend</> : <><Ban className="w-3.5 h-3.5" /> Suspend</>}
                </button>
                <button onClick={() => removeManager(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  <UserX className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}