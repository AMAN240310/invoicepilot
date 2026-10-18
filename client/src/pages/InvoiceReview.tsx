import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Save,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Copy,
  Info,
  Plus,
  Minus,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { EXPENSE_CATEGORIES } from '../types';
import type { InvoiceRecord, InvoiceLineItem } from '../types';
import { DocumentViewer } from '../components/DocumentViewer';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';

export const InvoiceReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // Form State
  const [vendorName, setVendorName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [subtotal, setSubtotal] = useState<string>('');
  const [tax, setTax] = useState<string>('');
  const [discount, setDiscount] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [category, setCategory] = useState<string>('Unclassified');
  const [paymentStatus, setPaymentStatus] = useState<string>('unknown');
  const [reviewStatus, setReviewStatus] = useState<string>('unreviewed');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  // Confirmation Modals
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  // Formats date into ISO YYYY-MM-DD for HTML date inputs
  const normalizeDateForInput = (d?: string | null): string => {
    if (!d) return '';
    const dmyMatch = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const isoMatch = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    return '';
  };

  const syncFormFromInvoice = (inv: InvoiceRecord) => {
    setInvoice(inv);
    setVendorName(inv.vendor_name || '');
    setInvoiceNumber(inv.invoice_number || '');
    setInvoiceDate(normalizeDateForInput(inv.invoice_date));
    setDueDate(normalizeDateForInput(inv.due_date));
    setCurrency(inv.currency || 'USD');
    setSubtotal(inv.subtotal_minor !== null && inv.subtotal_minor !== undefined ? (inv.subtotal_minor / 100).toFixed(2) : '');
    setTax(inv.tax_minor !== null && inv.tax_minor !== undefined ? (inv.tax_minor / 100).toFixed(2) : '');
    setDiscount(inv.discount_minor !== null && inv.discount_minor !== undefined ? (inv.discount_minor / 100).toFixed(2) : '');
    setTotal(inv.total_minor !== null && inv.total_minor !== undefined ? (inv.total_minor / 100).toFixed(2) : '');
    setCategory(inv.category || 'Unclassified');
    setPaymentStatus(inv.payment_status || 'unknown');
    setReviewStatus(inv.review_status || 'unreviewed');
    setLineItems(inv.line_items || []);
  };

  const loadInvoice = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await ApiService.getInvoiceById(id);
      syncFormFromInvoice(res.invoice);
    } catch (err: any) {
      showToast(err.message || 'Failed to load invoice details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [id]);

  // Convert decimal strings to integer minor units
  const parseMinor = (val: string): number | null => {
    if (!val || val.trim() === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : Math.round(num * 100);
  };

  const handleSave = async (andApprove = false) => {
    if (!id) return;
    try {
      setSaving(true);
      const payload: Partial<InvoiceRecord> = {
        vendor_name: vendorName.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        currency,
        subtotal_minor: parseMinor(subtotal),
        tax_minor: parseMinor(tax),
        discount_minor: parseMinor(discount),
        total_minor: parseMinor(total),
        category: category as any,
        payment_status: paymentStatus as any,
        review_status: andApprove ? 'approved' : (reviewStatus as any),
        line_items: lineItems,
      };

      const res = await ApiService.updateInvoice(id, payload);
      if (andApprove) {
        await ApiService.approveInvoice(id);
        showToast('Invoice approved and saved', 'success');
      } else {
        showToast('Changes saved successfully', 'success');
      }

      // Reload updated invoice to verify and synchronize state
      const reloaded = await ApiService.getInvoiceById(id);
      syncFormFromInvoice(reloaded.invoice);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    try {
      await ApiService.rejectInvoice(id);
      setReviewStatus('rejected');
      showToast('Invoice marked as rejected', 'info');
      setConfirmReject(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to reject invoice', 'error');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await ApiService.deleteInvoice(id);
      showToast('Invoice deleted', 'success');
      navigate('/invoices');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete invoice', 'error');
    }
  };

  const handleReprocess = async () => {
    if (!invoice?.document_id) return;
    try {
      setReprocessing(true);
      const res = await ApiService.reprocessDocument(invoice.document_id);
      if (res.success) {
        showToast('Document reprocessed by local AI', 'success');
        loadInvoice();
      } else {
        showToast(res.message || 'Reprocessing failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Reprocessing failed', 'error');
    } finally {
      setReprocessing(false);
    }
  };

  // Line item helpers
  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: 'New Item', quantity: 1, unit_price_minor: 0, line_total_minor: 0 },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-medium text-slate-400">Loading invoice details & document...</p>
        </div>
      </div>
    );
  }

  if (!invoice || !invoice.document) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Invoice or Document not found</h2>
        <button
          onClick={() => navigate('/invoices')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold text-white"
        >
          Return to Invoice Manager
        </button>
      </div>
    );
  }

  const warnings = invoice.validation_warnings || [];
  const evidence = invoice.extraction_data?.evidence;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header / Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/invoices')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {vendorName || 'Unidentified Vendor'}
              </h1>
              <StatusBadge type="review" value={reviewStatus} />
              {invoice.duplicate_status !== 'none' && (
                <StatusBadge type="duplicate" value={invoice.duplicate_status} />
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Invoice #{invoiceNumber || 'None'} &bull; Document ID: {invoice.document_id.substring(0, 8)}...
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleReprocess}
            disabled={reprocessing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-colors disabled:opacity-50"
            title="Re-run local AI extraction"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reprocessing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{reprocessing ? 'Extracting...' : 'Reprocess AI'}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmReject(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-xs border border-rose-500/30 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Reject</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/40 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Approve Invoice</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-rose-950/30 hover:border-rose-800 text-slate-400 hover:text-rose-400 transition-colors"
            title="Delete invoice"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Warnings & Integrity Discrepancy Banners */}
      {warnings.length > 0 && (
        <div className="glass-panel p-4 rounded-2xl border-amber-900/60 bg-amber-950/20 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Validation & Consistency Warnings</span>
          </div>
          <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
            {warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicate Alert Banner */}
      {invoice.duplicate_status === 'probable' && invoice.duplicate_document && (
        <div className="glass-panel p-4 rounded-2xl border-purple-900/60 bg-purple-950/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Copy className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-purple-300">Suspected Duplicate Invoice Detected</p>
              <p className="text-xs text-slate-400">
                Matches existing document: <span className="font-semibold text-slate-200">{invoice.duplicate_document.original_filename}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/invoices?search=${encodeURIComponent(invoice.duplicate_document!.original_filename)}`)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-purple-300 hover:text-white"
          >
            <span>View Original</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Side-by-Side Grid: Left = Document Viewer, Right = Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[650px]">
        {/* Document Viewer (Left Column) */}
        <div className="lg:col-span-6 flex flex-col h-[650px] lg:h-auto">
          <DocumentViewer document={invoice.document} />
        </div>

        {/* Extracted Fields Form (Right Column) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Extracted Financial Facts</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Model: {invoice.extraction_data?.modelUsed || 'Local AI'}
              </span>
            </div>

            {/* Core Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
                {evidence?.vendor_evidence && (
                  <p className="text-[10px] text-slate-500 mt-1 italic truncate">
                    Text evidence: "{evidence.vendor_evidence}"
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  placeholder="e.g. INV-2026-001"
                />
                {evidence?.invoice_number_evidence && (
                  <p className="text-[10px] text-slate-500 mt-1 italic truncate">
                    Text evidence: "{evidence.invoice_number_evidence}"
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Invoice Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Due Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Currency Code</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-emerald-500 focus:outline-none"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="unknown">Unknown</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Review Status</label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="unreviewed">Unreviewed</option>
                  <option value="needs_review">Needs Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {/* Financial Totals Breakdown */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Financial Breakdown ({currency})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Subtotal ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={subtotal}
                    onChange={(e) => setSubtotal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    placeholder="Unspecified"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tax Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    placeholder="Unspecified"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Discount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    placeholder="Unspecified"
                  />
                </div>

                <div>
                  <label className="block text-emerald-400 font-bold mb-1">Total Amount ({currency}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    placeholder="Unspecified"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Itemized Line Items</h3>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {lineItems.length > 0 ? (
                lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity || ''}
                      onChange={(e) => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || null)}
                      className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-center font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Total"
                      value={item.line_total_minor ? (item.line_total_minor / 100).toFixed(2) : ''}
                      onChange={(e) => updateLineItem(idx, 'line_total_minor', parseMinor(e.target.value))}
                      className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-right font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic">No line items extracted.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete Invoice Record"
        message="Are you sure you want to permanently delete this invoice? The record and associated line items will be removed."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Reject Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmReject}
        title="Reject Invoice Record"
        message="Are you sure you want to reject this invoice? It will be marked as rejected and excluded from approved expense analytics."
        confirmText="Reject Invoice"
        isDestructive={true}
        onConfirm={handleReject}
        onCancel={() => setConfirmReject(false)}
      />
    </div>
  );
};
