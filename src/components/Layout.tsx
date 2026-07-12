import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Bookmark, Briefcase, BarChart3, Settings, User, LogOut, Menu, X } from 'lucide-react';

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isStaff = user?.role === 'superadmin' || user?.role === 'manager';
  const isAdmin = user?.role === 'superadmin';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Build nav items by role. "My Profile" is always last.
  const navItems: { to: string; label: string; icon: typeof LayoutDashboard }[] = [];
  if (isAdmin) {
    navItems.push({ to: '/analytics', label: 'Analytics', icon: BarChart3 });
    navItems.push({ to: '/manage-jobs', label: 'Manage Jobs', icon: Briefcase });
    navItems.push({ to: '/admin', label: 'Admin Panel', icon: Settings });
  } else if (user?.role === 'manager') {
    navItems.push({ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard });
    navItems.push({ to: '/manage-jobs', label: 'Manage Jobs', icon: Briefcase });
  } else {
    navItems.push({ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard });
    navItems.push({ to: '/cart', label: 'My Saved Jobs', icon: Bookmark });
  }
  navItems.push({ to: '/profile', label: 'My Profile', icon: User });

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Briefcase className="w-7 h-7 text-[#8b2df2]" />
          <span className="font-heading text-xl font-bold">
            <span className="text-zinc-900">Tec</span>
            <span className="bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">Kosh</span>
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#8b2df2]/10 text-[#8b2df2]'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-zinc-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8b2df2] to-[#00b4d8] flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 truncate">{user?.name || 'User'}</div>
            <div className="text-xs text-zinc-400 capitalize">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-100 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-[#8b2df2]" />
          <span className="font-heading text-lg font-bold">
            <span className="text-zinc-900">Tec</span>
            <span className="bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">Kosh</span>
          </span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="p-2 text-zinc-600">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-1 text-zinc-500">
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-zinc-100 h-screen sticky top-0">
          {sidebar}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}