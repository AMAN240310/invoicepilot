import React, { useState, useEffect } from 'react';
import {
  Bot,
  Database,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  Sparkles,
  Server,
} from 'lucide-react';
import { ApiService } from '../services/api';
import type { SystemHealth, OllamaHealthStatus } from '../types';
import { useToast } from '../components/Toast';

export const Settings: React.FC = () => {
  const { showToast } = useToast();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaHealthStatus | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const [sysHealth, oStatus] = await Promise.all([
        ApiService.getHealth(),
        ApiService.getOllamaHealth(),
      ]);
      setHealth(sysHealth);
      setOllamaStatus(oStatus);
    } catch (err: any) {
      showToast(err.message || 'Failed to check system health', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestConnection = async () => {
    try {
      setTestingAi(true);
      const res = await ApiService.getOllamaHealth();
      setOllamaStatus(res);
      if (res.isAvailable) {
        showToast(`Ollama connected successfully. ${res.availableModels.length} model(s) detected.`, 'success');
      } else {
        showToast(res.error || 'Ollama is unreachable on local port 11434', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto pb-12">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">System & AI Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Monitor your local-first inference engine, database storage, and zero-cloud privacy architecture.
        </p>
      </div>

      {/* Ollama Local AI Section */}
      <div className="glass-panel p-6 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Ollama Local AI Inference</span>
                {ollamaStatus?.isAvailable ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3 h-3" /> Offline / Unreachable
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">Open-weight AI model running on localhost</p>
            </div>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testingAi}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Test Connection</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold">Configured AI Model:</span>
            <p className="text-sm font-mono font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>{ollamaStatus?.selectedModel || 'gemma4:e2b-it-qat'}</span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold">Ollama API Endpoint:</span>
            <p className="text-sm font-mono text-slate-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span>{ollamaStatus?.baseUrl || 'http://localhost:11434'}</span>
            </p>
          </div>
        </div>

        {/* Available Models List */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Locally Installed Models Discovered</span>
          </h4>
          {ollamaStatus?.availableModels && ollamaStatus.availableModels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ollamaStatus.availableModels.map((model) => (
                <span
                  key={model}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border ${
                    model === ollamaStatus.selectedModel
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {model} {model === ollamaStatus.selectedModel && '(Active)'}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              No models returned from Ollama. Ensure Ollama is running and run `ollama pull gemma:2b` or your chosen model.
            </p>
          )}
        </div>
      </div>

      {/* Storage and Database Section */}
      <div className="glass-panel p-6 rounded-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Local Storage & SQLite Database</h2>
            <p className="text-xs text-slate-400">Persistent storage locations on the host computer</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-sans font-semibold">SQLite Database Path:</span>
            <p className="text-xs text-slate-200 truncate">{health?.database.path || './data/invoicepilot.db'}</p>
            <span className="text-[10px] text-emerald-400 font-sans font-semibold flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> WAL Mode Enabled & Active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-sans font-semibold">Document Vault Directory:</span>
            <p className="text-xs text-slate-200 truncate">{health?.storage.uploadDir || './data/uploads'}</p>
            <span className="text-[10px] text-slate-400 font-sans">
              Strict limit: {health?.storage.maxFileSize || '10 MB'} per file
            </span>
          </div>
        </div>
      </div>

      {/* Privacy Architecture Guarantee Card */}
      <div className="glass-panel p-6 rounded-2xl border-emerald-900/40 bg-emerald-950/10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Local-First Privacy Architecture</h3>
            <p className="text-xs text-slate-400">Zero telemetry, zero third-party AI APIs</p>
          </div>
        </div>

        <div className="text-xs text-slate-300 leading-relaxed space-y-2">
          <p>
            &bull; <strong className="text-white">Complete Data Sovereignty:</strong> Your invoices, receipts, and sensitive business financial records never leave your machine.
          </p>
          <p>
            &bull; <strong className="text-white">No Hosted AI Dependence:</strong> Optical Character Recognition (OCR), text extraction, and open-weight language inference execute entirely on localhost.
          </p>
          <p>
            &bull; <strong className="text-white">Audit Proof:</strong> SQLite stores exact SHA-256 hashes for all documents, preventing tampering and duplicate ingestion.
          </p>
        </div>
      </div>
    </div>
  );
};
