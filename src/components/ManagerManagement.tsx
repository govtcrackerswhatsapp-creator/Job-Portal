import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { Loader2, Search, UserCheck, UserX, Ban, Play, ShieldCheck, X, UserPlus, Mail, Clock } from 'lucide-react';

interface Invite { email: string; addedAt?: number; }

export default function ManagerManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [usersSnap, invitesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'manager_invites')),
      ]);
      const uList: UserProfile[] = [];
      usersSnap.forEach((d) => uList.push(d.data() as UserProfile));
      setUsers(uList);
      const iList: Invite[] = [];
      invitesSnap.forEach((d) => iList.push({ email: d.id, ...(d.data() as { addedAt?: number }) }));
      setInvites(iList);
    } catch (e) {
      console.error('Error loading managers:', e);
    } finally {
      setLoading(false);
    }
  };

  const managers = useMemo(() => users.filter((u) => u.role === 'manager'), [users]);

  const pendingInvites = useMemo(() => {
    const managerEmails = new Set(managers.map((m) => m.email.toLowerCase()));
    return invites.filter((inv) => !managerEmails.has(inv.email.toLowerCase()));
  }, [invites, managers]);

  const searchMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return users.filter((u) => u.email.toLowerCase().includes(term) && u.role !== 'manager' && u.role !== 'superadmin').slice(0, 5);
  }, [users, search]);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  // Add a manager by typed email (works whether or not they've logged in).
  const addByEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!isValidEmail(email)) { alert('Please enter a valid email address.'); return; }
    const existing = users.find((u) => u.email.toLowerCase() === email);
    if (existing && existing.role === 'superadmin') { alert('That user is a superadmin.'); return; }
    if (existing && existing.role === 'manager') { alert('That user is already a manager.'); return; }
    try {
      setAddingEmail(true);
      // 1) Always write the invite (so first-login promotes them, and it's a record).
      await setDoc(doc(db, 'manager_invites', email), { addedAt: Date.now() });
      // 2) If they already have an account, promote it immediately.
      if (existing) {
        await updateDoc(doc(db, 'users', existing.uid), { role: 'manager', suspended: false });
      }
      setEmailInput('');
      setShowAdd(false);
      await load();
    } catch (e) {
      console.error('Error adding manager by email:', e);
      alert('Failed to add manager.');
    } finally {
      setAddingEmail(false);
    }
  };

  // Promote an existing (already-logged-in) user found via search.
  const makeManager = async (u: UserProfile) => {
    try {
      setActing(u.uid);
      await setDoc(doc(db, 'manager_invites', u.email.toLowerCase()), { addedAt: Date.now() });
      await updateDoc(doc(db, 'users', u.uid), { role: 'manager', suspended: false });
      setSearch('');
      setShowAdd(false);
      await load();
    } catch (e) {
      console.error('Error making manager:', e);
      alert('Failed to promote user.');
    } finally {
      setActing(null);
    }
  };

  // Remove an ACTIVE manager: demote user doc + delete any invite.
  const removeManager = async (u: UserProfile) => {
    if (!confirm(`Remove ${u.email} as manager? They become a regular user.`)) return;
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), { role: 'user', suspended: false });
      try { await deleteDoc(doc(db, 'manager_invites', u.email.toLowerCase())); } catch (e) { /* invite may not exist */ }
      await load();
    } catch (e) {
      console.error('Error removing manager:', e);
      alert('Failed to remove manager.');
    } finally {
      setActing(null);
    }
  };

  // Cancel a PENDING invite (person never joined): just delete the invite.
  const cancelInvite = async (email: string) => {
    if (!confirm(`Cancel the manager invite for ${email}?`)) return;
    try {
      setActing(email);
      await deleteDoc(doc(db, 'manager_invites', email.toLowerCase()));
      await load();
    } catch (e) {
      console.error('Error cancelling invite:', e);
      alert('Failed to cancel invite.');
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

      {showAdd && (
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-zinc-900">Add a manager by email</h3>
            <button onClick={() => setShowAdd(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-zinc-500 mb-3">Enter any Gmail address. They'll get manager access automatically the first time they sign in — they don't need to have logged in before.</p>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addByEmail(); }} placeholder="person@gmail.com" className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
            </div>
            <button onClick={addByEmail} disabled={addingEmail} className="inline-flex items-center gap-1 text-sm font-medium bg-[#8b2df2] text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 shrink-0">{addingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Add</button>
          </div>

          <div className="border-t border-zinc-200 pt-3">
            <p className="text-xs text-zinc-500 mb-2">Or search someone who has already signed in:</p>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user email..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
            </div>
            {search.trim() && (
              <div className="space-y-2">
                {searchMatches.length === 0 ? (
                  <p className="text-sm text-zinc-400">No matching signed-in users.</p>
                ) : searchMatches.map((u) => (
                  <div key={u.uid} className="bg-white rounded-lg p-3 border border-zinc-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{u.name || 'User'}</p>
                      <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                    </div>
                    <button onClick={() => makeManager(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium bg-[#8b2df2] text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 shrink-0">{acting === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Make Manager</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>
      ) : (
        <>
          {pendingInvites.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-zinc-700 mb-2">Invited — not joined yet ({pendingInvites.length})</h3>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.email} className="bg-amber-50/50 rounded-xl p-4 border border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0"><Clock className="w-4 h-4" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{inv.email}</p>
                        <p className="text-xs text-amber-700">Will become a manager on first sign-in</p>
                      </div>
                    </div>
                    <button onClick={() => cancelInvite(inv.email)} disabled={acting === inv.email} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50 shrink-0">{acting === inv.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Cancel</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {managers.length === 0 && pendingInvites.length === 0 ? (
            <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-100">
              <ShieldCheck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No managers yet. Add trusted people to help post jobs.</p>
            </div>
          ) : managers.length > 0 ? (
            <div>
              {pendingInvites.length > 0 && <h3 className="text-sm font-semibold text-zinc-700 mb-2">Active managers ({managers.length})</h3>}
              <div className="space-y-2">
                {managers.map((u) => (
                  <div key={u.uid} className="bg-white rounded-xl p-4 border border-zinc-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8b2df2] to-[#00b4d8] flex items-center justify-center text-white font-semibold text-sm shrink-0">{(u.name || u.email).charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900 truncate">{u.name || 'Manager'}</p>
                          {u.suspended && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Suspended</span>}
                        </div>
                        <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleSuspend(u)} disabled={acting === u.uid} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 ${u.suspended ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>{u.suspended ? <><Play className="w-3.5 h-3.5" /> Un-suspend</> : <><Ban className="w-3.5 h-3.5" /> Suspend</>}</button>
                      <button onClick={() => removeManager(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50"><UserX className="w-3.5 h-3.5" /> Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}