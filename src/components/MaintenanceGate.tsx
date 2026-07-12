import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loadAppSettings, DEFAULT_APP_SETTINGS } from '../lib/appSettings';
import { shouldBlockUser } from '../lib/maintenance';
import { AppSettings } from '../types';
import { Loader2, Wrench, LogOut } from 'lucide-react';

export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [, forceTick] = useState(0); // used to re-evaluate the schedule on the timer

  // Load settings once on mount.
  useEffect(() => {
    loadAppSettings().then(setSettings).catch(() => setSettings(DEFAULT_APP_SETTINGS));
  }, []);

  // Re-check the schedule every 60 seconds (pure clock comparison — no DB reads).
  // This makes scheduled windows turn on/off automatically without a refresh.
  useEffect(() => {
    const timer = setInterval(() => forceTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="w-8 h-8 text-[#8b2df2] animate-spin" />
      </div>
    );
  }

  // Evaluated on every render (including each 60s tick) against the current IST time.
  const blocked = shouldBlockUser(settings, user?.role);

  if (blocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-5">
          <Wrench className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-zinc-900 mb-2">Under Maintenance</h1>
        <p className="text-zinc-500 max-w-md">{settings.maintenanceMessage || DEFAULT_APP_SETTINGS.maintenanceMessage}</p>
        <button onClick={() => signOut()} className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-800">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    );
  }

  return <>{children}</>;
}