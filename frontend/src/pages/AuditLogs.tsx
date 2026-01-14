import React, { useState, useEffect } from 'react';
import { adminApi } from '../api';
import {
    ScrollText,
    RefreshCw,
    Search,
    Clock,
    Database
} from 'lucide-react';

interface SystemLog {
    id: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    details: any;
    created_at: string;
}

const AuditLogs: React.FC = () => {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('ALL');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getLogs();
            setLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    const filteredLogs = logs.filter(log => {
        const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
            JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
        return matchesSearch && matchesLevel;
    });

    return (
        <div className="animate-slide-up" style={{ paddingBottom: '3rem' }}>
            {/* Header Section */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '3rem',
                gap: '2rem'
            }}>
                <div>
                    <h1 className="text-gradient" style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        margin: 0
                    }}>
                        <ScrollText size={36} style={{ color: 'var(--accent-primary)' }} />
                        System Audit Logs
                    </h1>
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.75rem', fontSize: '1.1rem', fontWeight: 500 }}>
                        Real-time observability into Oracle intelligence & system telemetry
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="btn-premium"
                    disabled={loading}
                    style={{
                        padding: '0.75rem 1.5rem',
                        fontSize: '0.85rem',
                        flexShrink: 0
                    }}
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Synchronizing...' : 'Refresh Logs'}
                </button>
            </div>

            {/* Controls & Search */}
            <div className="glass-card" style={{
                padding: '1.5rem',
                marginBottom: '2.5rem',
                display: 'flex',
                flexDirection: 'row',
                gap: '1.5rem',
                alignItems: 'center',
                background: 'rgba(13, 17, 34, 0.4)'
            }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={20} style={{
                        position: 'absolute',
                        left: '1.25rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        opacity: 0.7
                    }} />
                    <input
                        type="text"
                        placeholder="Filter system logs by message, market ID, or evidence..."
                        className="input-glow"
                        style={{ paddingLeft: '3.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    gap: '0.25rem',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '0.4rem',
                    borderRadius: '14px',
                    border: '1px solid var(--glass-border)'
                }}>
                    {['ALL', 'INFO', 'WARN', 'ERROR'].map(level => (
                        <button
                            key={level}
                            onClick={() => setFilterLevel(level)}
                            style={{
                                padding: '0.6rem 1.25rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: filterLevel === level ? 'var(--accent-primary)' : 'transparent',
                                color: filterLevel === level ? 'white' : 'var(--text-dim)',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                minWidth: '70px',
                                boxShadow: filterLevel === level ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none'
                            }}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            {/* Multi-layered Glass Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)' }}>
                                <th style={{ width: '160px', padding: '1.25rem 1.5rem' }}>Timestamp</th>
                                <th style={{ width: '120px', padding: '1.25rem 1.5rem' }}>Status</th>
                                <th style={{ padding: '1.25rem 1.5rem' }}>Intelligence Activity</th>
                                <th style={{ width: '350px', padding: '1.25rem 1.5rem' }}>Full Context</th>
                            </tr>
                        </thead>
                        <tbody style={{ background: 'rgba(0,0,0,0.1)' }}>
                            {loading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '6rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <div style={{ position: 'relative', width: '60px', height: '60px', margin: '0 auto 1.5rem' }}>
                                            <RefreshCw size={60} className="animate-spin" style={{ color: 'var(--accent-primary)', opacity: 0.3 }} />
                                            <Database size={24} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white' }} />
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>Establishing Secure Link...</div>
                                        <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Parsing encrypted log streams from the decentralized oracle network.</div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '6rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Database size={48} style={{ margin: '0 auto 1.5rem', opacity: 0.2 }} />
                                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>No Records Found</div>
                                        <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Try adjusting your filters or search terms.</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '1.5rem', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>
                                                <Clock size={14} style={{ color: 'var(--accent-primary)' }} />
                                                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: 'var(--mono)', fontWeight: 500 }}>
                                                {new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem', verticalAlign: 'top' }}>
                                            <span className="badge" style={{
                                                fontSize: '0.7rem',
                                                padding: '0.35rem 0.75rem',
                                                background: log.level === 'ERROR' ? 'rgba(239, 68, 68, 0.15)' :
                                                    log.level === 'WARN' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                color: log.level === 'ERROR' ? '#f87171' :
                                                    log.level === 'WARN' ? '#fbbf24' : '#60a5fa',
                                                border: `1px solid ${log.level === 'ERROR' ? 'rgba(239, 68, 68, 0.2)' :
                                                    log.level === 'WARN' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)'
                                                    }`,
                                                borderRadius: '8px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}>
                                                <div style={{
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    background: 'currentColor',
                                                    boxShadow: '0 0 6px currentColor'
                                                }} />
                                                {log.level}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.5rem', verticalAlign: 'top' }}>
                                            <div style={{
                                                fontSize: '1rem',
                                                lineHeight: 1.6,
                                                color: 'white',
                                                fontWeight: 500,
                                                maxWidth: '600px'
                                            }}>
                                                {log.message}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem', verticalAlign: 'top' }}>
                                            <div
                                                className="mono"
                                                style={{
                                                    fontSize: '0.75rem',
                                                    color: 'rgba(255,255,255,0.7)',
                                                    background: 'rgba(0,0,0,0.4)',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                    maxHeight: '180px',
                                                    overflow: 'auto',
                                                    wordBreak: 'break-all',
                                                    whiteSpace: 'pre-wrap',
                                                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.3)'
                                                }}
                                            >
                                                {JSON.stringify(log.details, null, 2)}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLogs;
