import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { hasPortalAccess, hasActivePaidSubscription } from '../lib/access';
import { formatDate } from '../lib/format';
import { Loader2, Search, UserPlus, Ban, X, Gift, CalendarClock, ShieldCheck, Filter, Mail, Clock } from 'lucide-react';

type DateMode = 'start' | 'expiry';
type GrantKind = 'permanent' | 'timed';

interface FreeInvite {
  email: string;
  type: GrantKind;
  days?: number;
  planName?: string;
  createdAt?: number;
}

export default function SubscribersManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<FreeInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // Date filter
  const [dateMode, setDateMode] = useState<DateMode>('start');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Grant tool
  const [showGrant, setShowGrant] = useState(false);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantDays, setGrantDays] = useState('30');
  const [grantPlanName, setGrantPlanName] = useState('Manual Grant');

  // Grant-by-email tool
  const [emailInput, setEmailInput] = useState('');
  const [emailKind, setEmailKind] = useState<GrantKind>('permanent');
  const [emailDays, setEmailDays] = useState('30');
  const [emailLabel, setEmailLabel] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [usnap, isnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'free_access_invites')),
      ]);
      const list: UserProfile[] = [];
      usnap.forEach((d) => list.push(d.data() as UserProfile));
      setUsers(list);
      const inv: FreeInvite[] = [];
      isnap.forEach((d) => inv.push({ email: d.id, ...(d.data() as Omit<FreeInvite, 'email'>) }));
      setInvites(inv);
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setLoading(false);
    }
  };

  // Subscribers = users who currently have access (excluding staff, who are managed elsewhere).
  const subscribers = useMemo(() => {
    return users.filter((u) => u.role === 'user' && (u.freeAccess === true || hasActivePaidSubscription(u)));
  }, [users]);

  const filteredSubscribers = useMemo(() => {
    const from = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : null;
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : null;
    if (!from && !to) return subscribers;
    return subscribers.filter((u) => {
      const val = dateMode === 'start' ? u.subscriptionStart : u.subscriptionExpiry;
      if (!val) return false;
      if (from && val < from) return false;
      if (to && val > to) return false;
      return true;
    });
  }, [subscribers, dateMode, fromDate, toDate]);

  // Emails that already have a user account (to show "joined" state on invites)
  const existingEmails = useMemo(() => new Set(users.map((u) => u.email.toLowerCase())), [users]);
  const pendingInvites = useMemo(
    () => invites.filter((i) => !existingEmails.has(i.email.toLowerCase())),
    [invites, existingEmails]
  );

  const revoke = async (u: UserProfile) => {
    if (!confirm(`Revoke access for ${u.email}? They will lose access immediately (no refund).`)) return;
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), {
        subscriptionStatus: 'inactive',
        subscriptionExpiry: null,
        freeAccess: false,
      });
      setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, subscriptionStatus: 'inactive', subscriptionExpiry: null, freeAccess: false } : x)));
    } catch (e) {
      console.error('Error revoking:', e);
      alert('Failed to revoke access.');
    } finally {
      setActing(null);
    }
  };

  // Grant tool — find a user by email
  const grantMatches = useMemo(() => {
    const term = grantSearch.trim().toLowerCase();
    if (!term) return [];
    return users.filter((u) => u.email.toLowerCase().includes(term)).slice(0, 5);
  }, [users, grantSearch]);

  const grantFreeAccess = async (u: UserProfile) => {
    try {
      setActing(u.uid);
      await updateDoc(doc(db, 'users', u.uid), { freeAccess: true, subscriptionStart: Date.now(), planName: 'Free Access' });
      await load();
      setShowGrant(false);
      setGrantSearch('');
    } catch (e) {
      console.error('Error granting free access:', e);
      alert('Failed to grant free access.');
    } finally {
      setActing(null);
    }
  };

  const grantSubscription = async (u: UserProfile) => {
    const days = parseInt(grantDays, 10);
    if (isNaN(days) || days < 1) { alert('Enter a valid number of days.'); return; }
    try {
      setActing(u.uid);
      const now = Date.now();
      const base = u.subscriptionExpiry && u.subscriptionExpiry > now ? u.subscriptionExpiry : now;
      const expiry = base + days * 24 * 60 * 60 * 1000;
      await updateDoc(doc(db, 'users', u.uid), {
        subscriptionStatus: 'active',
        subscriptionExpiry: expiry,
        subscriptionStart: now,
        planName: grantPlanName || 'Manual Grant',
      });
      await load();
      setShowGrant(false);
      setGrantSearch('');
    } catch (e) {
      console.error('Error granting subscription:', e);
      alert('Failed to grant subscription.');
    } finally {
      setActing(null);
    }
  };

  // ---- Grant by email (works even if the person has never logged in) ----
  const addEmailInvite = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) { alert('Enter a valid email address.'); return; }

    // If they already have an account, apply the grant to it directly.
    const existing = users.find((u) => u.email.toLowerCase() === email);
    try {
      setAddingEmail(true);
      const now = Date.now();
      const label = emailLabel.trim() || (emailKind === 'timed' ? 'Manual Grant' : 'Free Access');

      if (existing) {
        if (emailKind === 'timed') {
          const days = parseInt(emailDays, 10);
          if (isNaN(days) || days < 1) { alert('Enter a valid number of days.'); setAddingEmail(false); return; }
          const base = existing.subscriptionExpiry && existing.subscriptionExpiry > now ? existing.subscriptionExpiry : now;
          await updateDoc(doc(db, 'users', existing.uid), {
            subscriptionStatus: 'active',
            subscriptionExpiry: base + days * 24 * 60 * 60 * 1000,
            subscriptionStart: now,
            planName: label,
          });
        } else {
          await updateDoc(doc(db, 'users', existing.uid), { freeAccess: true, subscriptionStart: now, planName: label });
        }
      } else {
        // No account yet — store an invite that is applied on their first login.
        const days = emailKind === 'timed' ? Math.max(1, parseInt(emailDays, 10) || 30) : 0;
        await setDoc(doc(db, 'free_access_invites', email), {
          type: emailKind,
          days,
          planName: label,
          createdAt: now,
        });
      }
      setEmailInput('');
      setEmailLabel('');
      await load();
      alert(existing ? 'Access granted to existing user.' : 'Invite saved. Access will apply when they sign in.');
    } catch (e) {
      console.error('Error adding email invite:', e);
      alert('Failed to grant access by email.');
    } finally {
      setAddingEmail(false);
    }
  };

  const cancelInvite = async (email: string) => {
    if (!confirm(`Cancel the pending invite for ${email}?`)) return;
    try {
      setActing(email);
      await deleteDoc(doc(db, 'free_access_invites', email));
      setInvites((prev) => prev.filter((i) => i.email !== email));
    } catch (e) {
      console.error('Error cancelling invite:', e);
      alert('Failed to cancel invite.');
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-heading text-lg font-semibold text-zinc-900">Subscribers ({subscribers.length})</h2>
        <button onClick={() => setShowGrant((s) => !s)} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition">
          <UserPlus className="w-4 h-4" /> Grant Access
        </button>
      </div>

      {/* Grant tool */}
      {showGrant && (
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-zinc-900">Grant access to a user</h3>
            <button onClick={() => setShowGrant(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
          </div>

          {/* ---- Grant by email (no prior login required) ---- */}
          <div className="bg-white rounded-lg p-4 border border-zinc-100 mb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Mail className="w-4 h-4 text-[#8b2df2]" />
              <h4 className="text-sm font-semibold text-zinc-900">Grant by email</h4>
            </div>
            <p className="text-xs text-zinc-500 mb-3">Give access to any Gmail — even if they've never signed in. If they already have an account, it applies now; otherwise it applies automatically the first time they sign in.</p>

            <div className="relative mb-3">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="person@gmail.com" className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button onClick={() => setEmailKind('permanent')} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${emailKind === 'permanent' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
                <Gift className="w-3.5 h-3.5" /> Free access (permanent)
              </button>
              <button onClick={() => setEmailKind('timed')} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${emailKind === 'timed' ? 'bg-[#8b2df2] text-white border-[#8b2df2]' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
                <CalendarClock className="w-3.5 h-3.5" /> Time-limited
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Label (shown as plan)</label>
                <input value={emailLabel} onChange={(e) => setEmailLabel(e.target.value)} placeholder={emailKind === 'timed' ? 'Manual Grant' : 'Free Access'} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
              </div>
              {emailKind === 'timed' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Duration (days)</label>
                  <input type="number" min="1" value={emailDays} onChange={(e) => setEmailDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
                </div>
              )}
            </div>

            <button onClick={addEmailInvite} disabled={addingEmail} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-lg px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">
              {addingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Grant access
            </button>
          </div>

          {/* ---- Grant by searching existing users ---- */}
          <p className="text-xs text-zinc-500 mb-2">Or search an existing user who has already signed in:</p>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={grantSearch} onChange={(e) => setGrantSearch(e.target.value)} placeholder="Search user email..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
          </div>

          {/* Grant settings */}
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Subscription label</label>
              <input value={grantPlanName} onChange={(e) => setGrantPlanName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Duration (days)</label>
              <input type="number" min="1" value={grantDays} onChange={(e) => setGrantDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" />
            </div>
          </div>

          {grantSearch.trim() && (
            <div className="space-y-2">
              {grantMatches.length === 0 ? (
                <p className="text-sm text-zinc-400">No users found. Use "Grant by email" above to invite them before they sign in.</p>
              ) : grantMatches.map((u) => (
                <div key={u.uid} className="bg-white rounded-lg p-3 border border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{u.name || 'User'}</p>
                    <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => grantSubscription(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium bg-[#8b2df2] text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                      <CalendarClock className="w-3.5 h-3.5" /> {grantDays}d subscription
                    </button>
                    <button onClick={() => grantFreeAccess(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                      <Gift className="w-3.5 h-3.5" /> Free access
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending email invites (not joined yet) */}
      {pendingInvites.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Invited — not joined yet ({pendingInvites.length})</h3>
          </div>
          <p className="text-xs text-amber-700 mb-3">These people were granted access by email but haven't signed in yet. Access applies automatically on their first sign-in.</p>
          <div className="space-y-2">
            {pendingInvites.map((i) => (
              <div key={i.email} className="bg-white rounded-lg p-3 border border-amber-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{i.email}</p>
                  <p className="text-xs text-zinc-400">
                    {i.type === 'timed' ? `Time-limited: ${i.days || 30} days` : 'Permanent free access'}
                    {i.planName ? ` • ${i.planName}` : ''}
                  </p>
                </div>
                <button onClick={() => cancelInvite(i.email)} disabled={acting === i.email} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                  {acting === i.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date filter */}
      <div className="bg-white rounded-xl p-3 border border-zinc-100 mb-4 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500"><Filter className="w-4 h-4" /> Filter by</span>
        <select value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)} className="px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30">
          <option value="start">Start date</option>
          <option value="expiry">Expiry date</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white" />
        <span className="text-sm text-zinc-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white" />
        {(fromDate || toDate) && <button onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs text-zinc-500 hover:text-zinc-800 underline">Clear</button>}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>
      ) : filteredSubscribers.length === 0 ? (
        <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-100">
          <ShieldCheck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">{subscribers.length === 0 ? 'No subscribers yet.' : 'No subscribers match the filter.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Start</th>
                <th className="text-left px-4 py-3 font-medium">Expiry</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredSubscribers.map((u) => (
                <tr key={u.uid} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-3 text-zinc-900 max-w-[180px] truncate">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.freeAccess ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Free access</span> : <span className="text-zinc-600">{u.planName || '—'}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{u.contact || '—'}</td>
                  <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{formatDate(u.subscriptionStart) || '—'}</td>
                  <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{u.freeAccess ? 'No expiry' : formatDate(u.subscriptionExpiry) || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => revoke(u)} disabled={acting === u.uid} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                      {acting === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}