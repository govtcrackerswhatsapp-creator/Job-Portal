import { useState } from 'react';
import PaymentSettings from '../components/PaymentSettings';
import SubscribersManagement from '../components/SubscribersManagement';
import ManagerManagement from '../components/ManagerManagement';
import DesignSettings from '../components/DesignSettings';
import GeneralSettings from '../components/GeneralSettings';
import BackupRestore from '../components/BackupRestore';
import DataRetention from '../components/DataRetention';
import { CreditCard, Users, UserCog, Palette, Settings, DatabaseBackup, ShieldAlert } from 'lucide-react';

type Tab = 'subscribers' | 'managers' | 'plans' | 'design' | 'general' | 'backup' | 'retention';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('subscribers');

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'subscribers', label: 'Subscribers', icon: Users },
    { id: 'managers', label: 'Managers', icon: UserCog },
    { id: 'plans', label: 'Plans', icon: CreditCard },
    { id: 'design', label: 'Design', icon: Palette },
    { id: 'general', label: 'General', icon: Settings },
    { id: 'backup', label: 'Backup', icon: DatabaseBackup },
    { id: 'retention', label: 'Retention', icon: ShieldAlert },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Administration</p>
        <h1 className="font-heading text-3xl font-bold text-zinc-900">Admin Panel</h1>
      </div>

      <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-soft w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id ? 'bg-[#8b2df2] text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-6">
        {tab === 'subscribers' && <SubscribersManagement />}
        {tab === 'managers' && <ManagerManagement />}
        {tab === 'plans' && <PaymentSettings />}
        {tab === 'design' && <DesignSettings />}
        {tab === 'general' && <GeneralSettings />}
        {tab === 'backup' && <BackupRestore />}
        {tab === 'retention' && <DataRetention />}
      </div>
    </div>
  );
}