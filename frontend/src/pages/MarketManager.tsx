import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../api';
import { Plus, Clock, BarChart3, TrendingUp, Sparkles, Edit2, Trash2, X, CalendarX, Check } from 'lucide-react';

function Countdown({ timestamp, label, color }: { timestamp: number, label?: string, color?: string }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const update = () => {
            const now = Date.now();
            const diff = timestamp - now;

            if (diff <= 0) {
                setTimeLeft('Ended');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            if (days >= 1) {
                setTimeLeft(`${days} day${days > 1 ? 's' : ''}`);
            } else if (hours >= 1) {
                setTimeLeft(`${hours} hour${hours > 1 ? 's' : ''}`);
            } else if (mins >= 1) {
                setTimeLeft(`${mins} min${mins > 1 ? 's' : ''}`);
            } else {
                setTimeLeft(`${secs} sec${secs > 1 ? 's' : ''}`);
            }
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [timestamp]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem'
        }}>
            {label && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontFamily: '"JetBrains Mono", monospace',
                color: timeLeft === 'Ended' ? 'var(--text-muted)' : (color || 'var(--accent-primary)'),
                fontSize: '0.85rem',
                fontWeight: 600
            }}>
                <Clock size={12} />
                {timeLeft}
            </div>
        </div>
    );
}

export default function MarketManager() {
    const location = useLocation();
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(location.search);
    const settleDateParam = queryParams.get('settleDate');

    const [markets, setMarkets] = useState<any[]>([]);
    const [formData, setFormData] = useState({ title: '', duration: 3600, yes: 0, no: 0, category: 'Other' });
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [editingMarket, setEditingMarket] = useState<any | null>(null);
    const [settlingMarket, setSettlingMarket] = useState<any | null>(null);
    const [editData, setEditData] = useState({ title: '', status: '', category: '' });
    const [selectedPayouts, setSelectedPayouts] = useState<any | null>(null);
    const [filterMode, setFilterMode] = useState<'OPEN' | 'RESOLVING' | 'SETTLED' | 'ALL'>('OPEN');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [termFilter, setTermFilter] = useState('All');
    const [scoutQuery, setScoutQuery] = useState('');

    const CATEGORIES = ['Crypto', 'Finance', 'NFL', 'NBA', 'Cricket', 'Football', 'Politics', 'Election', 'Other'];
    const TERMS = ['Ultra Short', 'Short', 'Long'];

    useEffect(() => {
        if (settleDateParam) {
            setFilterMode('SETTLED');
        }
    }, [settleDateParam]);

    const fetchMarkets = async () => {
        try {
            const res = await adminApi.listMarkets();
            setMarkets(res.data);

            const metaRes = await adminApi.getMeta();
            if (metaRes.data.last_scout_run) {
                setLastRun(metaRes.data.last_scout_run);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleRunScout = async () => {
        setIsRunning(true);
        try {
            await adminApi.runScout(scoutQuery);
            alert('AI Scout initiated! Markets will appear shortly.');
            setScoutQuery('');
        } catch (error) {
            console.error(error);
        } finally {
            setIsRunning(false);
        }
    };

    useEffect(() => {
        fetchMarkets();
        const interval = setInterval(fetchMarkets, 10000);

        const handleSocketUpdate = () => {
            fetchMarkets();
        };

        import('../socketService').then(({ socket }) => {
            socket.on('global_market_deleted', handleSocketUpdate);
            socket.on('global_status_update', handleSocketUpdate);
        });

        return () => {
            clearInterval(interval);
            import('../socketService').then(({ socket }) => {
                socket.off('global_market_deleted', handleSocketUpdate);
                socket.off('global_status_update', handleSocketUpdate);
            });
        };
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await adminApi.createMarket({
                title: formData.title,
                durationSeconds: Number(formData.duration),
                initYes: Number(formData.yes),
                initNo: Number(formData.no),
                category: formData.category
            });
            setFormData({ title: '', duration: 3600, yes: 0, no: 0, category: 'Other' });
            fetchMarkets();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this market? This will also delete all associated wagers.')) return;
        try {
            await adminApi.deleteMarket(id);
            fetchMarkets();
        } catch (error) {
            console.error(error);
            alert('Failed to delete market');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMarket) return;
        try {
            await adminApi.updateMarket(editingMarket.id, editData);
            setEditingMarket(null);
            fetchMarkets();
        } catch (error) {
            console.error(error);
            alert('Failed to update market');
        }
    };

    const handleManualSettle = async (id: string, outcome: 'yes' | 'no') => {
        if (!confirm(`Are you sure you want to settle this market as ${outcome.toUpperCase()}?`)) return;
        try {
            await adminApi.settleMarket(id, outcome);
            setSettlingMarket(null);
            fetchMarkets();
        } catch (error) {
            console.error(error);
            alert('Failed to settle market');
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                        <BarChart3 size={20} />
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem' }}>Inventory</span>
                    </div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Prediction Markets</h2>
                </div>

                <div style={{ display: 'flex', gap: '2rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Active Pools</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{markets.filter(m => m.status === 'OPEN').length}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Volume</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            ${markets.reduce((acc, m) => acc + Number(m.total_pool), 0).toLocaleString()}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                            AI Agent
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                className="input-glow"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: '200px' }}
                                placeholder="Scout intent (e.g. Cricket jan 3)"
                                value={scoutQuery}
                                onChange={e => setScoutQuery(e.target.value)}
                            />
                            <button
                                onClick={handleRunScout}
                                disabled={isRunning}
                                className="btn-premium"
                                style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                            >
                                <Sparkles size={16} />
                                {isRunning ? 'Running...' : 'Run Scout'}
                            </button>
                        </div>
                        {lastRun && (
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                Last ran: {new Date(lastRun).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {settleDateParam && (
                <div className="glass-card animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--accent-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <CalendarX size={20} className="text-accent" />
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Filtering by Settle Date:</span>
                            <span style={{ color: 'white', fontWeight: 700, marginLeft: '0.5rem' }}>{settleDateParam}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/markets')}
                        className="btn-premium"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                    >
                        Clear Filter
                    </button>
                </div>
            )}

            <section className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                        <TrendingUp size={18} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Launch New Market</h3>
                </div>

                <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', alignItems: 'end' }}>
                    <div style={{ gridColumn: 'span 3' }}>
                        <label className="label">Proposition Title</label>
                        <input
                            className="input-glow"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g. Will ETH break $10,000 this year?"
                        />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label">Category</label>
                        <select
                            className="input-glow"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-white)' }}
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                        >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label">Expiry (Sec)</label>
                        <input
                            className="input-glow"
                            type="number"
                            value={formData.duration}
                            onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })}
                        />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label">Seed YES</label>
                        <input
                            className="input-glow"
                            type="number"
                            value={formData.yes}
                            onChange={e => setFormData({ ...formData, yes: Number(e.target.value) })}
                        />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label">Seed NO</label>
                        <input
                            className="input-glow"
                            type="number"
                            value={formData.no}
                            onChange={e => setFormData({ ...formData, no: Number(e.target.value) })}
                        />
                    </div>
                    <div style={{ gridColumn: 'span 1' }}>
                        <button type="submit" className="btn-premium" style={{ width: '100%', justifyContent: 'center', padding: '0.8rem' }}>
                            <Plus size={20} />
                        </button>
                    </div>
                </form>
            </section>

            <section className="glass-card" style={{ padding: 0 }}>
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {[
                            { id: 'OPEN', label: 'Active', count: markets.filter(m => m.status === 'OPEN').length },
                            { id: 'RESOLVING', label: 'Resolving', count: markets.filter(m => m.status === 'RESOLVING' || m.status === 'CLOSED').length },
                            { id: 'SETTLED', label: 'Settled', count: markets.filter(m => m.status === 'SETTLED' || m.status === 'VOIDED').length },
                            { id: 'ALL', label: 'All', count: markets.length }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setFilterMode(tab.id as any)}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    border: '1px solid transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    background: filterMode === tab.id ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.03)',
                                    color: filterMode === tab.id ? 'white' : 'var(--text-muted)',
                                    boxShadow: filterMode === tab.id ? '0 4px 15px rgba(139, 92, 246, 0.3)' : 'none',
                                    borderColor: filterMode === tab.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'
                                }}
                            >
                                {tab.label}
                                <span style={{ fontSize: '0.7rem', opacity: 0.6, background: 'rgba(0,0,0,0.2)', padding: '0.1rem 0.4rem', borderRadius: '6px' }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Category:</div>
                            <select
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            >
                                <option value="All">All Categories</option>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Term:</div>
                            <select
                                value={termFilter}
                                onChange={e => setTermFilter(e.target.value)}
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            >
                                <option value="All">All Terms</option>
                                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Proposition</th>
                                <th>Status</th>
                                <th>Liquidity Pools</th>
                                <th>Volume</th>
                                <th>Confidence</th>
                                <th>Timeline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {markets
                                .filter(m => {
                                    if (filterMode === 'OPEN') {
                                        if (m.status !== 'OPEN') return false;
                                    } else if (filterMode === 'RESOLVING') {
                                        if (m.status !== 'RESOLVING' && m.status !== 'CLOSED') return false;
                                    } else if (filterMode === 'SETTLED') {
                                        if (m.status !== 'SETTLED' && m.status !== 'VOIDED') return false;
                                    }
                                    if (categoryFilter !== 'All' && m.category !== categoryFilter) return false;
                                    if (termFilter !== 'All' && m.term !== termFilter) return false;
                                    if (!settleDateParam) return true;
                                    const mDate = new Date(Number(m.resolution_timestamp)).toISOString().split('T')[0];
                                    return mDate === settleDateParam;
                                })
                                .map(m => (
                                    <tr key={m.id} onClick={async () => {
                                        if (m.status === 'SETTLED') {
                                            try {
                                                const res = await adminApi.getMarketPayouts(m.id);
                                                setSelectedPayouts(res.data);
                                            } catch (err) { console.error(err); }
                                        }
                                    }} style={{ cursor: m.status === 'SETTLED' ? 'pointer' : 'default' }}>
                                        <td style={{ maxWidth: '300px' }}>
                                            <div style={{ marginBottom: '0.25rem', display: 'flex', gap: '0.4rem' }}>
                                                <span className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                                    {m.category || 'Other'}
                                                </span>
                                                {m.term && (
                                                    <span className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                                        {m.term}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-white)' }}>{m.title}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.id.slice(0, 8)}</div>
                                        </td>
                                        <td>
                                            <span className={m.status === 'OPEN' ? 'badge badge-success' : m.status === 'RESOLVING' ? 'badge badge-accent' : 'badge'}>
                                                {m.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
                                                <div style={{ color: '#4ade80' }}>Y: {Number(m.pool_yes).toLocaleString()}</div>
                                                <div style={{ color: '#f87171' }}>N: {Number(m.pool_no).toLocaleString()}</div>
                                            </div>
                                        </td>
                                        <td className="mono">${Number(m.total_pool).toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: '50px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${m.confidence_score * 100}%`, height: '100%', background: 'var(--accent-gradient)' }} />
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>{(m.confidence_score * 100).toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td style={{ minWidth: '140px' }}>
                                            <Countdown timestamp={Number(m.closure_timestamp)} label="Closes" color="#fbbf24" />
                                            <Countdown timestamp={Number(m.resolution_timestamp)} label="Resolves" color="#8b5cf6" />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => { setEditingMarket(m); setEditData({ title: m.title, status: m.status, category: m.category || 'Other' }); }} className="btn-premium" style={{ padding: '0.35rem' }}><Edit2 size={12} /></button>
                                                <button onClick={() => handleDelete(m.id)} className="btn-premium" style={{ padding: '0.35rem', color: '#f87171' }}><Trash2 size={12} /></button>
                                                {m.status !== 'SETTLED' && (
                                                    <>
                                                        <button onClick={() => setSettlingMarket(m)} className="btn-premium" style={{ padding: '0.35rem', color: '#4ade80' }} title="Manual Settle"><Check size={12} /></button>
                                                        <button onClick={async () => { if (confirm('Run AI Oracle?')) { await adminApi.resolveMarket(m.id); fetchMarkets(); } }} className="btn-premium" style={{ padding: '0.35rem', color: '#a78bfa' }} title="AI Resolve"><Sparkles size={12} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {editingMarket && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="glass-card" style={{ width: '450px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h3>Edit Market</h3>
                            <button onClick={() => setEditingMarket(null)} style={{ background: 'none', border: 'none', color: 'white' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input className="input-glow" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} />
                            <select className="input-glow" style={{ background: '#1a1f35', color: 'white' }} value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value })}>
                                <option value="OPEN">OPEN</option>
                                <option value="CLOSED">CLOSED</option>
                                <option value="RESOLVING">RESOLVING</option>
                            </select>
                            <select className="input-glow" style={{ background: '#1a1f35', color: 'white' }} value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button type="submit" className="btn-premium" style={{ marginTop: '1rem', justifyContent: 'center' }}>Save</button>
                        </form>
                    </div>
                </div>
            )}

            {selectedPayouts && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="glass-card" style={{ width: '800px', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Market Audit</h3>
                                <p style={{ color: 'var(--text-muted)' }}>{selectedPayouts.market.title}</p>
                            </div>
                            <button onClick={() => setSelectedPayouts(null)} style={{ background: 'none', border: 'none', color: 'white' }}><X size={24} /></button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stake</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${selectedPayouts.summary.total_stake.toLocaleString()}</div>
                            </div>
                            <div className="glass-card" style={{ padding: '1rem', textAlign: 'center', background: 'rgba(74, 222, 128, 0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>Payout</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>${selectedPayouts.summary.total_payout.toLocaleString()}</div>
                            </div>
                            <div className="glass-card" style={{ padding: '1rem', textAlign: 'center', background: 'rgba(139, 92, 246, 0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>Rake</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-primary)' }}>${selectedPayouts.summary.total_rake.toLocaleString()}</div>
                            </div>
                        </div>
                        <table style={{ width: '100%' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '1rem' }}>Merchant</th>
                                    <th style={{ padding: '1rem' }}>Stake</th>
                                    <th style={{ padding: '1rem' }}>Payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(selectedPayouts.merchant_breakdown).map(([name, data]: [string, any]) => (
                                    <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '1rem' }}>{name}</td>
                                        <td style={{ padding: '1rem' }}>${data.stake.toLocaleString()}</td>
                                        <td style={{ padding: '1rem', color: '#4ade80' }}>${data.payout.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {settlingMarket && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="glass-card animate-slide-up" style={{ width: '400px', padding: '2rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', textAlign: 'left' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Manual Settlement</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Choose final outcome</p>
                            </div>
                            <button onClick={() => setSettlingMarket(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', textAlign: 'left' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>MARKET</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{settlingMarket.title}</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                onClick={() => handleManualSettle(settlingMarket.id, 'yes')}
                                className="btn-premium"
                                style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderColor: 'rgba(74, 222, 128, 0.2)', padding: '1rem' }}
                            >
                                Settle YES
                            </button>
                            <button
                                onClick={() => handleManualSettle(settlingMarket.id, 'no')}
                                className="btn-premium"
                                style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)', padding: '1rem' }}
                            >
                                Settle NO
                            </button>
                        </div>

                        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Warning: Manual settlement is final and will trigger payouts immediately.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
