import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Store, Users, Bell, X, Receipt, LogOut, ScrollText, Share2 } from 'lucide-react';
import { socket } from '../socketService';

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const handleMarketDeleted = (data: { marketId: string }) => {
      const id = Date.now();
      setNotifications(prev => [...prev, {
        id,
        title: 'Market Terminated',
        message: `Market ID ${data.marketId.slice(0, 8)} has been deleted from the network.`,
        type: 'warning'
      }]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    };

    socket.on('global_market_deleted', handleMarketDeleted);

    return () => {
      socket.off('global_market_deleted', handleMarketDeleted);
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/markets', label: 'Markets', icon: Store },
    { path: '/merchants', label: 'Merchants', icon: Users },
    { path: '/wagers', label: 'Wagers', icon: Receipt },
    { path: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
    { path: '/webhooks', label: 'Merchant Comms', icon: Share2 },
  ];

  return (
    <div className="flex h-screen" style={{ overflow: 'hidden', background: 'var(--bg-dark)' }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: '280px', flexShrink: 0, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '3rem', padding: '0 0.5rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em' }}>
            ANTIGRAVITY
          </h1>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em', marginTop: '0.2rem' }}>
            B2B GATEWAY PRO
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', paddingLeft: '0.75rem' }}>
            Main Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  color: isActive ? 'white' : 'var(--text-dim)',
                  backgroundColor: isActive ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative'
                }}
              >
                {isActive && (
                  <div style={{ position: 'absolute', left: '-1.5rem', width: '4px', height: '24px', background: 'var(--accent-primary)', borderRadius: '0 4px 4px 0', boxShadow: '0 0 20px var(--accent-primary)' }} />
                )}
                <Icon size={20} style={{ color: isActive ? 'var(--accent-primary)' : 'inherit' }} />
                <span style={{ fontWeight: isActive ? 600 : 400, fontSize: '0.95rem' }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="glass-card" style={{ padding: '1rem', marginTop: 'auto', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Network</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--success)', fontWeight: 500 }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 10px currentColor' }} className="pulse-light" />
            Mainnet-v2.5
          </div>

          <button
            onClick={onLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginTop: '1.5rem',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid rgba(248, 113, 113, 0.2)',
              background: 'rgba(248, 113, 113, 0.05)',
              color: '#f87171',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem 3rem', position: 'relative' }}>
        {/* Notification Container */}
        <div style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          pointerEvents: 'none'
        }}>
          {notifications.map(n => (
            <div
              key={n.id}
              className="glass-card animate-slide-up"
              style={{
                width: '320px',
                padding: '1.25rem',
                borderLeft: '4px solid #f87171',
                pointerEvents: 'auto',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                background: 'rgba(20, 20, 25, 0.95)',
                backdropFilter: 'blur(12px)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  <Bell size={14} />
                  {n.title}
                </div>
                <button
                  onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-white)', lineHeight: 1.4 }}>{n.message}</p>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

