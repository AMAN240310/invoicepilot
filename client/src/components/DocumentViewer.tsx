import React, { useState } from 'react';
import { ExternalLink, Download, ZoomIn, ZoomOut, RotateCw, FileText } from 'lucide-react';
import type { DocumentRecord } from '../types';

interface DocumentViewerProps {
  document: DocumentRecord;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ document }) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const fileUrl = `/api/documents/${document.id}/file`;
  const isPdf = document.mime_type === 'application/pdf';

  return (
    <div className="flex flex-col h-full bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Viewer Header / Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 truncate max-w-xs">
          <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-semibold text-slate-200 truncate">{document.original_filename}</span>
          <span className="text-slate-500 text-[10px]">({(document.file_size / 1024).toFixed(1)} KB)</span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isPdf && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 w-10 text-center">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(250, z + 25))}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Rotate 90deg"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Open original file in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={fileUrl}
            download={document.original_filename}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-auto flex items-center justify-center p-4 bg-slate-950/40">
        {isPdf ? (
          <iframe
            src={`${fileUrl}#toolbar=1&navpanes=0`}
            title={document.original_filename}
            className="w-full h-full min-h-[550px] rounded-lg border border-slate-800/80 bg-slate-900"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center overflow-auto min-h-[450px]">
            <img
              src={fileUrl}
              alt={document.original_filename}
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.15s ease-out',
              }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl origin-center"
            />
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800/60 text-[11px] text-slate-500 flex justify-between items-center font-mono">
        <span>SHA-256: {document.file_hash.substring(0, 16)}...</span>
        <span>MIME: {document.mime_type}</span>
      </div>
    </div>
  );
};
