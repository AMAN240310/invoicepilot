import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Copy,
  UploadCloud,
  ArrowRight,
  TrendingUp,
  AlertOctagon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { ApiService } from '../services/api';
import type { AnalyticsSummary, MonthlyExpense, CategoryExpense } from '../types';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';

const CATEGORY_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#06b6d4', '#14b8a6', '#f97316', '#64748b', '#84cc16',
];

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyExpense[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, monthRes, catRes] = await Promise.all([
        ApiService.getSummary(),
        ApiService.getMonthly('USD'),
        ApiService.getCategories('USD'),
      ]);
      setSummary(sumRes);
      setMonthlyData(monthRes);
      setCategoryData(catRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRetryProcessing = async (docId: string) => {
    try {
      setRetryingId(docId);
      const res = await ApiService.reprocessDocument(docId);
      if (res.success) {
        showToast('Document reprocessed successfully', 'success');
        loadData();
      } else {
        showToast(res.message || 'Processing failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to reprocess', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-medium text-slate-400">Loading financial dashboard...</p>
        </div>
      </div>
    );
  }

  // Format currency display helpers
  const primaryRecorded = summary?.totalRecordedValues.find((v) => v.currency === 'USD') || summary?.totalRecordedValues[0];
  const primaryApproved = summary?.totalApprovedExpenses.find((v) => v.currency === 'USD') || summary?.totalApprovedExpenses[0];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header with Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time financial overview powered by local, private AI invoice extraction.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950/40 transition-all hover:shadow-emerald-900/60"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Invoices</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Invoices"
          value={summary?.totalInvoiceCount || 0}
          subtitle="Processed documents"
          icon={<FileText className="w-5 h-5" />}
          accent="blue"
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          title="Recorded Value"
          value={primaryRecorded ? `$${primaryRecorded.total_major.toLocaleString()}` : '$0.00'}
          subtitle={summary?.totalRecordedValues.length && summary.totalRecordedValues.length > 1 ? `+${summary.totalRecordedValues.length - 1} other currencies` : 'Across all invoices'}
          icon={<DollarSign className="w-5 h-5" />}
          accent="purple"
        />
        <StatCard
          title="Approved Expenses"
          value={primaryApproved ? `$${primaryApproved.total_major.toLocaleString()}` : '$0.00'}
          subtitle="Verified by user"
          icon={<TrendingUp className="w-5 h-5" />}
          accent="emerald"
          onClick={() => navigate('/invoices?review_status=approved')}
        />
        <StatCard
          title="Requires Review"
          value={summary?.needsReviewCount || 0}
          subtitle="Warnings or unreviewed"
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="amber"
          onClick={() => navigate('/invoices?review_status=needs_review')}
        />
        <StatCard
          title="Duplicates Flagged"
          value={summary?.possibleDuplicatesCount || 0}
          subtitle="Exact & probable matches"
          icon={<Copy className="w-5 h-5" />}
          accent="rose"
          onClick={() => navigate('/invoices?duplicate_status=probable')}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Expenses Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">Monthly Expense Trend</h2>
              <p className="text-xs text-slate-400">Total expenditure aggregated by calendar month (USD)</p>
            </div>
            <span className="text-xs font-mono font-medium px-2 py-1 rounded bg-slate-800 text-slate-300">
              USD
            </span>
          </div>

          <div className="h-64">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Total']}
                  />
                  <Bar dataKey="total_major" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-medium">
                No monthly expense data recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Expenses by Category Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">Expense Categories</h2>
              <p className="text-xs text-slate-400">Spending distribution suggested by local AI (USD)</p>
            </div>
            <button
              onClick={() => navigate('/analytics')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
            >
              <span>Detailed</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-64 flex items-center justify-center">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total_major"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Spent']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-500 font-medium">
                No category data available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Recent Invoices</h2>
            <p className="text-xs text-slate-400">Latest documents extracted and persistent in SQLite</p>
          </div>
          <button
            onClick={() => navigate('/invoices')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Invoice #</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Review Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {summary?.recentInvoices && summary.recentInvoices.length > 0 ? (
                summary.recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5 font-semibold text-white">
                      {inv.vendor_name || 'Unknown Vendor'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">
                      {inv.invoice_number || 'N/A'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">
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
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                        Review &rarr;
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500 text-xs font-medium">
                    No invoices recorded yet. Click "Upload Invoices" to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Processing Failures Section (if any exist) */}
      {summary?.recentFailures && summary.recentFailures.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border-rose-900/50 bg-rose-950/10">
          <div className="flex items-center gap-2 mb-4 text-rose-400">
            <AlertOctagon className="w-5 h-5 flex-shrink-0" />
            <h3 className="font-bold text-sm">Recent Processing Failures Requiring Attention</h3>
          </div>
          <div className="space-y-2.5">
            {summary.recentFailures.map((failure) => (
              <div
                key={failure.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs gap-3"
              >
                <div>
                  <span className="font-semibold text-white mr-2">{failure.original_filename}</span>
                  <span className="text-rose-400">{failure.processing_error || 'Extraction error'}</span>
                </div>
                <button
                  onClick={() => handleRetryProcessing(failure.id)}
                  disabled={retryingId === failure.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold self-start sm:self-auto disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingId === failure.id ? 'animate-spin' : ''}`} />
                  <span>Retry Processing</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
