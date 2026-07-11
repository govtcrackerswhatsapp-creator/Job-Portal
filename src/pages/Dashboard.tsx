import { useAuth } from '../contexts/AuthContext';
import { LogOut } from 'lucide-react';

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-heading text-2xl font-bold text-zinc-900">Dashboard</h1>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-800"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-soft p-6">
          <p className="text-zinc-700">
            Welcome, <span className="font-semibold">{user?.name || user?.email}</span>!
          </p>
          <p className="text-sm text-zinc-500 mt-2">Role: {user?.role}</p>
          <p className="text-sm text-zinc-400 mt-4">
            Authentication is working. We'll build the real dashboard next.
          </p>
        </div>
      </div>
    </div>
  );
}