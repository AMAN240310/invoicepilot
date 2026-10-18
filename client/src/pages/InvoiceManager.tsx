import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  Trash2,
  CheckCircle2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { EXPENSE_CATEGORIES } from '../types';
import type { InvoiceRecord } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';

export const InvoiceManager: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<(InvoiceRecord & { original_filename: string })[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filters from query params
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || 'all';
  const reviewStatus = searchParams.get('review_status') || 'all';
  const paymentStatus = searchParams.get('payment_status') || 'all';
  const duplicateStatus = searchParams.get('duplicate_status') || 'all';
  const currency = searchParams.get('currency') || 'all';
  const sort = searchParams.get('sort') || 'created_at';
  const order = (searchParams.get('order') as 'asc' | 'desc') || 'desc';
  const page = parseInt(searchParams.get('page') || '1', 10);

  // Confirmation dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await ApiService.getInvoices({
        search: search || undefined,
        category: category !== 'all' ? category : undefined,
        review_status: reviewStatus !== 'all' ? reviewStatus : undefined,
        payment_status: paymentStatus !== 'all' ? paymentStatus : undefined,
        duplicate_status: duplicateStatus !== 'all' ? duplicateStatus : undefined,
        currency: currency !== 'all' ? currency : undefined,
        sort,
        order,
        page,
        limit: 15,
      });
      setInvoices(res.invoices);
      setPagination(res.pagination);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [searchParams]);

  const updateFilter = (key: string, value: string) => {
    const updated = new URLSearchParams(searchParams);
    if (value === 'all' || !value) {
      updated.delete(key);
    } else {
      updated.set(key, value);
    }
    updated.set('page', '1');
    setSearchParams(updated);
  };

  const handlePageChange = (newPage: number) => {
    const updated = new URLSearchParams(searchParams);
    updated.set('page', newPage.toString());
    setSearchParams(updated);
  };

  const handleQuickApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await ApiService.approveInvoice(id);
      showToast('Invoice approved', 'success');
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, review_status: 'approved' } : inv)));
    } catch (err: any) {
      showToast(err.message || 'Failed to approve invoice', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await ApiService.deleteInvoice(deleteId);
      showToast('Invoice record deleted', 'success');
      setInvoices((prev) => prev.filter((i) => i.id !== deleteId));
      setDeleteId(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete invoice', 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const res = await ApiService.exportCsv({
        approved_only: true,
        category: category !== 'all' ? category : undefined,
      });
      if (res.success) {
        showToast('Approved invoices exported to CSV', 'success');
      } else {
        showToast(res.message || 'No approved records match filters', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Invoice Manager</h1>
          <p className="text-sm text-slate-400 mt-1">
            Search, review, edit, approve, and export persistent invoice records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>{isExporting ? 'Exporting...' : 'Export CSV (Approved)'}</span>
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/40 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel p-4 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* Search Input */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search vendor, invoice #, file..."
              value={search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={category}
              onChange={(e) => updateFilter('category', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Review Status Filter */}
          <div>
            <select
              value={reviewStatus}
              onChange={(e) => updateFilter('review_status', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Review Statuses</option>
              <option value="needs_review">Needs Review</option>
              <option value="approved">Approved</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={paymentStatus}
              onChange={(e) => updateFilter('payment_status', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* Duplicate Status Filter */}
          <div>
            <select
              value={duplicateStatus}
              onChange={(e) => updateFilter('duplicate_status', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Duplicate Status</option>
              <option value="probable">Probable Duplicate</option>
              <option value="exact">Exact Duplicate</option>
              <option value="none">No Duplicate</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Vendor</th>
                <th className="px-5 py-3.5">Invoice #</th>
                <th className="px-5 py-3.5">Invoice Date</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Total Amount</th>
                <th className="px-5 py-3.5">Review Status</th>
                <th className="px-5 py-3.5">Duplicate</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>Loading invoices...</span>
                  </td>
                </tr>
              ) : invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5 font-semibold text-white">
                      <div>{inv.vendor_name || 'Unknown Vendor'}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{inv.original_filename}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono text-xs">
                      {inv.invoice_number || 'N/A'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">
                      {inv.invoice_date || 'N/A'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                        {inv.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-white font-mono">
                      {inv.total_minor !== null ? `${inv.currency} ${(inv.total_minor / 100).toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge type="review" value={inv.review_status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge type="duplicate" value={inv.duplicate_status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Review Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {inv.review_status !== 'approved' && (
                          <button
                            onClick={(e) => handleQuickApprove(inv.id, e)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Quick Approve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteId(inv.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500 text-xs font-medium">
                    No invoice records found matching your active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <div>
            Showing <span className="font-semibold text-white">{invoices.length}</span> of{' '}
            <span className="font-semibold text-white">{pagination.total}</span> records
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono">
              Page {pagination.page} / {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="Delete Invoice Record"
        message="Are you sure you want to delete this invoice record? This will permanently remove the record and its line items from the database."
        confirmText="Delete Record"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
