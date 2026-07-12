import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { SubscriptionPlan } from '../types';
import { formatRupees } from '../lib/format';
import { getPlans, clearPlansCache } from '../lib/plansData';
import { Plus, Pencil, Trash2, X, Loader2, Save, IndianRupee } from 'lucide-react';

interface PlanForm {
  name: string;
  price: string;
  annualPrice: string;
  durationInDays: string;
  details: string;
  badge: string;
  features: string;
  active: boolean;
}

const EMPTY: PlanForm = { name: '', price: '', annualPrice: '', durationInDays: '30', details: '', badge: '', features: '', active: true };

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

export default function PaymentSettings() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PlanForm>({ ...EMPTY });

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const list = await getPlans(true); // fresh for the admin view
      setPlans(list);
    } catch (e) {
      console.error('Error fetching plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setForm({ ...EMPTY }); setEditingId(null); setShowForm(true); };

  const openEdit = (p: SubscriptionPlan) => {
    setForm({
      name: p.name,
      price: String(p.price),
      annualPrice: p.annualPrice != null ? String(p.annualPrice) : '',
      durationInDays: String(p.durationInDays),
      details: p.details || '',
      badge: p.badge || '',
      features: (p.features || []).join('\n'),
      active: p.active,
    });
    setEditingId(p.id || null);
    setShowForm(true);
  };

  const handleSave = async () => {
    const priceNum = parseInt(form.price, 10);
    const durationNum = parseInt(form.durationInDays, 10);
    if (!form.name.trim() || isNaN(priceNum) || priceNum < 1 || isNaN(durationNum) || durationNum < 1) {
      alert('Please enter a valid name, price (≥1), and duration (≥1 day).');
      return;
    }
    try {
      setSaving(true);
      const payload: any = {
        name: form.name.trim(),
        price: priceNum,
        annualPrice: form.annualPrice.trim() ? parseInt(form.annualPrice, 10) : null,
        durationInDays: durationNum,
        details: form.details.trim(),
        badge: form.badge.trim(),
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        active: form.active,
      };
      if (editingId) {
        await updateDoc(doc(db, 'plans', editingId), payload);
      } else {
        await addDoc(collection(db, 'plans'), payload);
      }
      clearPlansCache();
      setShowForm(false);
      await fetchPlans();
    } catch (e) {
      console.error('Error saving plan:', e);
      alert('Failed to save plan. Check permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id || !confirm('Delete this plan?')) return;
    try {
      await deleteDoc(doc(db, 'plans', id));
      clearPlansCache();
      await fetchPlans();
    } catch (e) {
      console.error('Error deleting plan:', e);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-zinc-900">Subscription Plans</h2>
        {!showForm && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> New Plan
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-900">{editingId ? 'Edit Plan' : 'New Plan'}</h3>
            <button onClick={() => setShowForm(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Plan Name</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Pro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Monthly Price (₹)</label>
                <input type="number" min="1" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="499" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Annual Price (₹) <span className="text-zinc-400 font-normal">optional</span></label>
                <input type="number" min="1" className={inputCls} value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: e.target.value })} placeholder="4999" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Duration (days, for monthly)</label>
              <input type="number" min="1" className={inputCls} value={form.durationInDays} onChange={(e) => setForm({ ...form, durationInDays: e.target.value })} placeholder="30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Tagline <span className="text-zinc-400 font-normal">optional</span></label>
              <input className={inputCls} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Best for serious aspirants" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Badge <span className="text-zinc-400 font-normal">optional — e.g. "Most Popular"</span></label>
              <input className={inputCls} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="Most Popular" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Features <span className="text-zinc-400 font-normal">one per line</span></label>
              <textarea className={inputCls} rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder={'All premium job details\nStudy material access\nPriority updates'} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              Active (visible to users)
            </label>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Plan
              </button>
              <button onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-100">
          <IndianRupee className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">No plans yet. Create one so users can subscribe.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="bg-white rounded-xl p-4 border border-zinc-100 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900">{p.name}</span>
                  {p.badge && <span className="text-xs bg-[#8b2df2]/10 text-[#8b2df2] px-2 py-0.5 rounded-full">{p.badge}</span>}
                  {!p.active && <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {formatRupees(p.price)}/{p.durationInDays}d
                  {p.annualPrice != null && ` · ${formatRupees(p.annualPrice)}/year`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(p)} className="p-2 text-zinc-400 hover:text-[#8b2df2]"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(p.id)} className="p-2 text-zinc-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}