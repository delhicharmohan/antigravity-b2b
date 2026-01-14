import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MarketManager from './pages/MarketManager';
import MerchantManager from './pages/MerchantManager';
import WagerLedger from './pages/WagerLedger';
import AuditLogs from './pages/AuditLogs';
import WebhookAudit from './pages/WebhookAudit';
import LoginPage from './pages/LoginPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    setIsAuthenticated(!!token);
  }, []);

  if (isAuthenticated === null) return null;

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout onLogout={() => {
          localStorage.removeItem('admin_token');
          setIsAuthenticated(false);
        }} />}>
          <Route index element={<Dashboard />} />
          <Route path="markets" element={<MarketManager />} />
          <Route path="merchants" element={<MerchantManager />} />
          <Route path="wagers" element={<WagerLedger />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="webhooks" element={<WebhookAudit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
