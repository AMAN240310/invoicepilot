import axios from 'axios';
import type {
  AnalyticsSummary,
  MonthlyExpense,
  CategoryExpense,
  VendorExpense,
  DocumentRecord,
  InvoiceRecord,
  ProcessingLog,
  SystemHealth,
  OllamaHealthStatus,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 45000,
});

export const ApiService = {
  // --- Analytics ---
  async getSummary(): Promise<AnalyticsSummary> {
    const res = await api.get<{ success: boolean; summary: AnalyticsSummary }>('/analytics/summary');
    return res.data.summary;
  },

  async getMonthly(currency = 'USD', startDate?: string, endDate?: string): Promise<MonthlyExpense[]> {
    const res = await api.get<{ success: boolean; monthly: MonthlyExpense[] }>('/analytics/monthly', {
      params: { currency, startDate, endDate },
    });
    return res.data.monthly;
  },

  async getCategories(currency = 'USD', startDate?: string, endDate?: string): Promise<CategoryExpense[]> {
    const res = await api.get<{ success: boolean; categories: CategoryExpense[] }>('/analytics/categories', {
      params: { currency, startDate, endDate },
    });
    return res.data.categories;
  },

  async getVendors(currency = 'USD', limit = 10): Promise<VendorExpense[]> {
    const res = await api.get<{ success: boolean; vendors: VendorExpense[] }>('/analytics/vendors', {
      params: { currency, limit },
    });
    return res.data.vendors;
  },

  // --- Documents ---
  async uploadDocuments(
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; message: string; documents: DocumentRecord[] }> {
    const formData = new FormData();
    files.forEach((f) => formData.append('documents', f));

    const res = await api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  async getDocuments(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ documents: DocumentRecord[]; pagination: { page: number; total: number; totalPages: number } }> {
    const res = await api.get('/documents', { params });
    return res.data;
  },

  async getDocumentById(id: string): Promise<{ document: DocumentRecord; invoice: InvoiceRecord | null; logs: ProcessingLog[] }> {
    const res = await api.get(`/documents/${id}`);
    return res.data;
  },

  async reprocessDocument(id: string): Promise<{ success: boolean; message: string; document: DocumentRecord; invoice?: InvoiceRecord }> {
    const res = await api.post(`/documents/${id}/process`);
    return res.data;
  },

  async deleteDocument(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },

  // --- Invoices ---
  async getInvoices(params?: {
    search?: string;
    category?: string;
    review_status?: string;
    payment_status?: string;
    duplicate_status?: string;
    currency?: string;
    startDate?: string;
    endDate?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{ invoices: (InvoiceRecord & { original_filename: string })[]; pagination: { page: number; total: number; totalPages: number } }> {
    const res = await api.get('/invoices', { params });
    return res.data;
  },

  async getInvoiceById(id: string): Promise<{ success: boolean; invoice: InvoiceRecord }> {
    const res = await api.get(`/invoices/${id}`);
    return res.data;
  },

  async updateInvoice(id: string, data: Partial<InvoiceRecord>): Promise<{ success: boolean; invoice: InvoiceRecord }> {
    const res = await api.patch(`/invoices/${id}`, data);
    return res.data;
  },

  async approveInvoice(id: string): Promise<{ success: boolean; invoice: InvoiceRecord }> {
    const res = await api.post(`/invoices/${id}/approve`);
    return res.data;
  },

  async rejectInvoice(id: string): Promise<{ success: boolean; invoice: InvoiceRecord }> {
    const res = await api.post(`/invoices/${id}/reject`);
    return res.data;
  },

  async deleteInvoice(id: string): Promise<void> {
    await api.delete(`/invoices/${id}`);
  },

  // --- Export ---
  async exportCsv(params?: {
    approved_only?: boolean;
    category?: string;
    vendor?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; count?: number; message?: string }> {
    const res = await api.get('/export/csv', {
      params,
      responseType: 'blob',
    });

    // Check if JSON error response was returned as blob
    if (res.headers['content-type']?.includes('application/json')) {
      const text = await (res.data as Blob).text();
      const parsed = JSON.parse(text);
      return parsed;
    }

    // Trigger file download in browser
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `invoicepilot-export-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return { success: true };
  },

  // --- Health ---
  async getHealth(): Promise<SystemHealth> {
    const res = await api.get('/health');
    return res.data;
  },

  async getOllamaHealth(): Promise<OllamaHealthStatus> {
    const res = await api.get<{ success: boolean; ollama: OllamaHealthStatus }>('/health/ollama');
    return res.data.ollama;
  },
};
