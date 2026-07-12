import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { PaymentRecord } from '../types';
import { formatRupees, formatDate } from '../lib/format';
import { Loader2, IndianRupee, CheckCircle2, Receipt, Download, Trash2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const PAGE_SIZE = 20;
type StatusFilter = 'all' | 'success' | 'failed' | 'pending';
type DateFilter = 'all' | '7d' | '30d' | '90d';

export default function Analytics() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: PaymentRecord[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as PaymentRecord) }));
      setPayments(list);
    } catch (e) {
      console.error('Error loading payments:', e);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters (used by stats, export, and the table).
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = dateFilter === '7d' ? now - 7 * 864e5 : dateFilter === '30d' ? now - 30 * 864e5 : dateFilter === '90d' ? now - 90 * 864e5 : 0;
    return payments.filter((p) => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchDate = !cutoff || p.createdAt >= cutoff;
      return matchStatus && matchDate;
    });
  }, [payments, statusFilter, dateFilter]);

  // Stats operate on the FULL filtered set (not just the current page).
  const stats = useMemo(() => {
    const successful = filtered.filter((p) => p.status === 'success');
    const revenue = successful.reduce((sum, p) => sum + (p.amount || 0), 0);
    return { revenue, successCount: successful.length, total: filtered.length };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [statusFilter, dateFilter]);

  const exportExcel = () => {
    const rows = filtered.map((p) => ({
      Date: formatDate(p.createdAt),
      Email: p.email,
      Contact: p.contact || '',
      Plan: p.planName,
      'Amount (₹)': p.amount,
      Status: p.status,
      'Payment ID': p.razorpayPaymentId || '',
      'Order ID': p.razorpayOrderId || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');
    XLSX.writeFile(wb, `payments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDelete = async (p: PaymentRecord) => {
    if (!p.id) return;
    if (!confirm(`Delete this ${p.status} record? This cannot be undone.`)) return;
    try {
      setDeletingId(p.id);
      await deleteDoc(doc(db, 'payments', p.id));
      setPayments((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      console.error('Error deleting record:', e);
      alert('Failed to delete record.');
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-50 text-emerald-700';
      case 'failed': return 'bg-red-50 text-red-700';
      default: return 'bg-amber-50 text-amber-700';
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Insights</p>
          <h1 className="font-heading text-3xl font-bold text-zinc-900">Analytics</h1>
        </div>
        <button onClick={exportExcel} className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft hover:bg-emerald-700 transition">
          <Download className="w-4 h-4" /> Export to Excel
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-soft p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#8b2df2]/10 flex items-center justify-center"><IndianRupee className="w-5 h-5 text-[#8b2df2]" /></div>
          <div>
            <p className="text-xs text-zinc-400">Total Revenue (filtered)</p>
            <p className="font-heading text-2xl font-bold text-zinc-900">{formatRupees(stats.revenue)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-soft p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-zinc-400">Successful Payments</p>
            <p className="font-heading text-2xl font-bold text-zinc-900">{stats.successCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-soft p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><Receipt className="w-5 h-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-zinc-400">Total Records</p>
            <p className="font-heading text-2xl font-bold text-zinc-900">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-soft p-4 mb-4 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500"><Filter className="w-4 h-4" /> Filters</span>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className="px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30">
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30">
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">No payment records match the filters.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Contact</th>
                    <th className="text-left px-4 py-3 font-medium">Plan</th>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pageRows.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3 text-zinc-900 max-w-[180px] truncate">{p.email}</td>
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{p.contact || '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{p.planName}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{formatRupees(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(p.status)}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(p.status === 'failed' || p.status === 'pending') && (
                          <button onClick={() => handleDelete(p)} disabled={deletingId === p.id} className="p-1.5 text-zinc-300 hover:text-red-600 transition" title="Delete record">
                            {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
              <p className="text-xs text-zinc-400">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-40 hover:bg-zinc-50"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm text-zinc-600">{currentPage} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-40 hover:bg-zinc-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}