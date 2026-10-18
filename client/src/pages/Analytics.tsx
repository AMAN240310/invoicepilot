import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Layers, Building, RefreshCw, Calendar } from 'lucide-react';
import { ApiService } from '../services/api';
import type { MonthlyExpense, CategoryExpense, VendorExpense } from '../types';
import { useToast } from '../components/Toast';

const CATEGORY_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#06b6d4', '#14b8a6', '#f97316', '#64748b', '#84cc16',
];

export const Analytics: React.FC = () => {
  const { showToast } = useToast();
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [monthlyData, setMonthlyData] = useState<MonthlyExpense[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryExpense[]>([]);
  const [vendorData, setVendorData] = useState<VendorExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [mRes, cRes, vRes] = await Promise.all([
        ApiService.getMonthly(currency, startDate || undefined, endDate || undefined),
        ApiService.getCategories(currency, startDate || undefined, endDate || undefined),
        ApiService.getVendors(currency, 15),
      ]);
      setMonthlyData(mRes);
      setCategoryData(cRes);
      setVendorData(vRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [currency, startDate, endDate]);

  const totalCurrencySpend = categoryData.reduce((sum, item) => sum + item.total_major, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title & Currency / Date Range Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Expense Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Financial reporting and expense category distributions isolated per currency.
          </p>
        </div>

        {/* Currency & Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <span className="font-semibold text-slate-400">Currency:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none"
              title="Start Date"
            />
            <span className="text-slate-500">&rarr;</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none"
              title="End Date"
            />
          </div>
        </div>
      </div>

      {/* Metric Highlight */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-emerald-900/30 bg-emerald-950/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Total Filtered Spend ({currency})</p>
          <h2 className="text-3xl font-extrabold text-white mt-1">
            {currency} {totalCurrencySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Aggregated across {categoryData.reduce((cnt, item) => cnt + item.count, 0)} documents
          </p>
        </div>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 self-start sm:self-auto">
          <TrendingUp className="w-6 h-6" />
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Monthly Trajectory ({currency})</span>
          </h3>
          <p className="text-xs text-slate-400 mb-6">Chronological invoice totals by month</p>

          <div className="h-72">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${currency} ${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    formatter={(val: any) => [`${currency} ${Number(val).toFixed(2)}`, 'Expenditure']}
                  />
                  <Bar dataKey="total_major" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No monthly transactions recorded in {currency}.
              </div>
            )}
          </div>
        </div>

        {/* Expense Category Breakdown Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Expense Category Allocation</span>
          </h3>
          <p className="text-xs text-slate-400 mb-6">Breakdown classified by AI models</p>

          <div className="h-72 flex items-center justify-center">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total_major"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    formatter={(val: any) => [`${currency} ${Number(val).toFixed(2)}`, 'Spent']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-500">
                No category records available in {currency}.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Vendors Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-400" />
            <span>Top Vendors by Expenditure ({currency})</span>
          </h3>
          <p className="text-xs text-slate-400">Highest volume payees recorded in the system</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Invoice Count</th>
                <th className="px-5 py-3">Currency</th>
                <th className="px-5 py-3 text-right">Total Recorded Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {vendorData.length > 0 ? (
                vendorData.map((v, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-white">{v.vendor}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{v.count} invoice(s)</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{v.currency}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-white font-mono">
                      {v.currency} {v.total_major.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500 text-xs">
                    No vendor transactions recorded in {currency}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
