import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  FileCheck,
  ShieldCheck,
  ArrowRight,
  AlertOctagon,
} from 'lucide-react';
import { ApiService } from '../services/api';
import type { DocumentRecord } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';

export const UploadCenter: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<DocumentRecord[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

  const fetchRecentDocuments = async () => {
    try {
      const data = await ApiService.getDocuments({ limit: 15 });
      setRecentDocs(data.documents);
    } catch {
      // ignore on initial load
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    fetchRecentDocuments();
    // Auto-poll recent documents every 4 seconds to watch background processing progress
    const interval = setInterval(fetchRecentDocuments, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleFiles = (incomingFiles: FileList | File[]) => {
    const valid: File[] = [];
    const errors: string[] = [];

    Array.from(incomingFiles).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Unsupported format. PDF, PNG, and JPEG only.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Exceeds 10MB limit.`);
        return;
      }
      valid.push(file);
    });

    if (errors.length > 0) {
      showToast(errors[0], 'error');
    }

    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const res = await ApiService.uploadDocuments(selectedFiles, (percent) => {
        setUploadProgress(percent);
      });

      showToast(res.message, 'success');
      setUploadedDocs(res.documents);
      setSelectedFiles([]);
      setUploadProgress(null);
      fetchRecentDocuments();
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = async (docId: string) => {
    try {
      setRetryingId(docId);
      const res = await ApiService.reprocessDocument(docId);
      if (res.success) {
        showToast('Document reprocessed successfully', 'success');
        fetchRecentDocuments();
      } else {
        showToast(res.message || 'Processing failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to reprocess', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Upload Center</h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload digital invoices and receipts. All OCR, PDF extraction, and AI structuring run 100% locally on your machine.
        </p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`glass-panel p-8 sm:p-12 rounded-3xl border-2 border-dashed text-center transition-all duration-200 ${
          dragActive
            ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
            : 'border-slate-700/80 hover:border-slate-600 bg-slate-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />

        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-bold text-white mb-1">
          Drag and drop invoice files here
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          Supported formats: <span className="text-slate-300 font-semibold">PDF, PNG, JPEG</span> (Up to 10 MB each, up to 10 files per batch)
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 shadow-md transition-colors"
        >
          Browse Files
        </button>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Local SHA-256 Duplicate Check
          </span>
          <span>&bull;</span>
          <span>Zero External API Calls</span>
        </div>
      </div>

      {/* Selected Files Queue */}
      {selectedFiles.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>Ready for Processing ({selectedFiles.length} files)</span>
            </h3>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-3 truncate">
                  <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="font-semibold text-white truncate">{file.name}</span>
                  <span className="text-slate-500 font-mono">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          {uploadProgress !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-emerald-950/50 transition-all"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Batch...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Start Processing ({selectedFiles.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Live Recent Processing Stream */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Recent Upload Stream</h3>
            <p className="text-xs text-slate-400">Real-time status of documents analyzed by local AI engine</p>
          </div>
          <button
            onClick={fetchRecentDocuments}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh stream"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-800/60">
          {recentDocs.length > 0 ? (
            recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors text-xs"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm">{doc.original_filename}</h4>
                    <div className="flex items-center gap-2 text-slate-400 mt-0.5 font-mono text-[11px]">
                      <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                      <span>&bull;</span>
                      <span>Hash: {doc.file_hash.substring(0, 10)}...</span>
                      <span>&bull;</span>
                      <span>{new Date(doc.uploaded_at).toLocaleTimeString()}</span>
                    </div>
                    {doc.processing_error && (
                      <p className="text-rose-400 text-xs mt-1 flex items-center gap-1">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        <span>{doc.processing_error}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <StatusBadge type="processing" value={doc.processing_status} />

                  {doc.processing_status === 'failed' && (
                    <button
                      onClick={() => handleRetry(doc.id)}
                      disabled={retryingId === doc.id}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${retryingId === doc.id ? 'animate-spin' : ''}`} />
                      <span>Retry</span>
                    </button>
                  )}

                  {(doc.processing_status === 'completed' || doc.processing_status === 'needs_review') && (
                    <button
                      onClick={() => navigate(`/invoices?search=${encodeURIComponent(doc.original_filename)}`)}
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                    >
                      <span>Inspect</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs font-medium">
              No recent documents uploaded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
