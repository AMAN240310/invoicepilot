import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { UploadCenter } from './pages/UploadCenter';
import { InvoiceManager } from './pages/InvoiceManager';
import { InvoiceReview } from './pages/InvoiceReview';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<UploadCenter />} />
            <Route path="invoices" element={<InvoiceManager />} />
            <Route path="invoices/:id" element={<InvoiceReview />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
