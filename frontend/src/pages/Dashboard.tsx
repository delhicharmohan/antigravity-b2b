import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api';
import { Shield, Globe, Clock, Wallet, BarChart3, Target, Store, Calendar, RefreshCw } from 'lucide-react';

export default function Dashboard() {
    const navigate = useNavigate();
    const [recentWagers, setRecentWagers] = useState<any[]>([]);
    const [dashboardStats, setDashboardStats] = useState<any>({
        open_markets_count: 0,
        active_pool: 0,
        total_volume: 0,
        settle_today_count: 0,
        historical_active_pool: 0
    });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const isToday = selectedDate === new Date().toISOString().split('T')[0];

    const fetchData = async () => {
        setLoading(true);
        try {
            const wagersRes = await adminApi.listWagers();
            const wagersData = Array.isArray(wagersRes.data) ? wagersRes.data : [];
            setRecentWagers(wagersData.slice(0, 5));

            const statsRes = await adminApi.getStats(selectedDate);
            if (statsRes.data && typeof statsRes.data === 'object' && !Array.isArray(statsRes.data)) {
                setDashboardStats(statsRes.data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Polling only if today is selected
        let interval: any;
        if (isToday) {
            interval = setInterval(fetchData, 15000);
        }
        return () => clearInterval(interval);
    }, [selectedDate]);

    const metrics = [
        {
            label: 'Markets Open',
            value: dashboardStats?.open_markets_count ?? 0,
            icon: Store,
            color: '#10b981',
            detail: 'Live on Network'
        },
        {
            label: 'Active Pool',
            value: `$${(isToday ? (dashboardStats?.active_pool ?? 0) : (dashboardStats?.historical_active_pool ?? 0)).toLocaleString()}`,
            icon: Wallet,
            color: '#8b5cf6',
            detail: isToday ? 'Current TVL' : 'Est. Pool on Date'
        },
        {
            label: 'Pool Volume',
            value: `$${(dashboardStats?.total_volume ?? 0).toLocaleString()}`,
            icon: BarChart3,
            color: '#3b82f6',
            detail: 'Cumulative Stake'
        },
        {
            label: 'Settle Today',
            value: dashboardStats?.settle_today_count ?? 0,
            icon: Target,
            color: '#f59e0b',
            detail: 'Scheduled for Resolution'
        },
    ];

    return (
        <div className="animate-slide-up">
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                        <Globe size={20} />
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem' }}>Network Overview</span>
                    </div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>System Informatics</h2>
                </div>

                <div className="glass-card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        <Calendar size={16} />
                        <span style={{ fontWeight: 600 }}>Filter:</span>
                    </div>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    />
                    <button
                        onClick={fetchData}
                        className={`refresh-btn ${loading ? 'spinning' : ''}`}
                        title="Refresh Data"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                    >
                        <RefreshCw size={16} />
                    </button>
                    {!isToday && (
                        <div className="badge badge-purple" style={{ fontSize: '0.65rem' }}>HISTORICAL</div>
                    )}
                    {isToday && (
                        <div className="badge badge-green" style={{ fontSize: '0.65rem' }}>LIVE</div>
                    )}
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                {metrics.map((stat, i) => (
                    <div
                        key={i}
                        className="glass-card"
                        onClick={() => stat.label === 'Settle Today' && navigate(`/markets?settleDate=${selectedDate}`)}
                        style={{
                            padding: '1.75rem',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: stat.label === 'Settle Today' ? 'pointer' : 'default'
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            top: '-20px',
                            right: '-20px',
                            width: '100px',
                            height: '100px',
                            background: `radial-gradient(circle, ${stat.color}15 0%, transparent 70%)`,
                            pointerEvents: 'none'
                        }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '12px',
                                background: `${stat.color}15`,
                                border: `1px solid ${stat.color}30`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: stat.color
                            }}>
                                <stat.icon size={22} />
                            </div>
                            {isToday && <div className="badge" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.6rem' }}>Realtime</div>}
                        </div>
                        <h3 style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            {stat.label}
                        </h3>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>{stat.value}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {stat.detail}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                <section className="glass-card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                            <Clock size={20} className="text-accent" />
                            Live Liquidity Feed
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Showing Last 5 Transactions</span>
                    </div>
                    <div className="table-container" style={{ margin: 0 }}>
                        <table style={{ background: 'transparent' }}>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>Volume</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentWagers.length > 0 ? recentWagers.map(w => (
                                    <tr key={w.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{w.market_title}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>via {w.merchant_name}</div>
                                        </td>
                                        <td className="mono" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                                            ${Number(w.stake).toLocaleString()}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                            {new Date(w.created_at).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                            No recent transactions detected on the edge.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-card" style={{ padding: '2rem', background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15) 0%, transparent 70%)' }}>
                        <div className="text-gradient" style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem' }}>Autonomous Node</div>
                        <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                            Operating in high-autonomy mode, utilizing multi-agent consensus for event resolution.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</span>
                                <span style={{ fontWeight: 600, color: 'var(--success)' }}>OPERATIONAL</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Latency</span>
                                <span style={{ fontWeight: 600 }}>12ms</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Protocol</span>
                                <span className="badge badge-purple" style={{ fontSize: '0.6rem' }}>B2B Enterprise v2.5</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid rgba(139, 92, 246, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                                <Shield size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Security Protocol</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HMAC-SHA256 Active</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .refresh-btn:hover { color: white !important; }
                .refresh-btn.spinning { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                input[type="date"]::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                    opacity: 0.5;
                    cursor: pointer;
                }
                .refresh-btn:active { transform: scale(0.9); transition: transform 0.1s; }
            `}</style>
        </div>
    );
}
