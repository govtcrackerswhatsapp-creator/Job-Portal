import { useAuth } from '../contexts/AuthContext';
import { hasPortalAccess, hasActivePaidSubscription } from '../lib/access';
import { formatDate } from '../lib/format';
import { User, Mail, Shield, CheckCircle2, XCircle, Crown } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;

  const isStaff = user.role === 'superadmin' || user.role === 'manager';
  const hasAccess = hasPortalAccess(user);
  const paidActive = hasActivePaidSubscription(user);

  let accessLabel = 'No active access';
  if (isStaff) accessLabel = 'Full access (staff)';
  else if (user.freeAccess) accessLabel = 'Free access (granted)';
  else if (paidActive) accessLabel = 'Active subscription';

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Account</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">My Profile</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-[#8b2df2] to-[#00b4d8] flex items-center justify-center text-white text-2xl font-bold">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-bold text-zinc-900 break-words">{user.name || 'User'}</h2>
            <p className="text-sm text-zinc-500 capitalize flex items-center gap-1">
              {user.role === 'superadmin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
              {user.role}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="min-w-0"><p className="text-xs text-zinc-400">Email</p><p className="text-sm font-medium text-zinc-900">{user.email}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="min-w-0"><p className="text-xs text-zinc-400">Role</p><p className="text-sm font-medium text-zinc-900 capitalize">{user.role}</p></div>
          </div>
        </div>
      </div>

      {/* Access status */}
      <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
        <h2 className="font-heading text-base font-semibold text-zinc-900 mb-4">Access Status</h2>
        <div className={`flex items-center gap-3 p-4 rounded-xl ${hasAccess ? 'bg-emerald-50' : 'bg-zinc-50'}`}>
          {hasAccess ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" /> : <XCircle className="w-6 h-6 text-zinc-400 shrink-0" />}
          <div className="min-w-0">
            <p className={`font-medium ${hasAccess ? 'text-emerald-800' : 'text-zinc-600'}`}>{accessLabel}</p>
            {paidActive && user.subscriptionExpiry && (
              <p className="text-xs text-emerald-600 mt-0.5">Valid until {formatDate(user.subscriptionExpiry)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}