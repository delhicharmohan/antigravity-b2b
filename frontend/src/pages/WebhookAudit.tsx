import { useState, useEffect } from 'react';
import { adminApi } from '../api';
import { Share2, RefreshCw, CheckCircle2, XCircle, Search, Clock, ExternalLink } from 'lucide-react';

export default function WebhookAudit() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getWebhookLogs();
            setLogs(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 15000);
        return () => clearInterval(interval);
    }, []);

    const filteredLogs = logs.filter(log => {
        const search = searchTerm.toLowerCase();
        return (
            log.merchant_name?.toLowerCase().includes(search) ||
            log.url?.toLowerCase().includes(search) ||
            log.event_type?.toLowerCase().includes(search) ||
            log.id?.toLowerCase().includes(search)
        );
    });

    return (
        <div className="animate-slide-up">
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                        <Share2 size={20} />
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem' }}>Merchant Communications</span>
                    </div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Webhook Audit Trail</h2>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '400px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            className="input-glow"
                            style={{ paddingLeft: '3rem' }}
                            placeholder="Search by merchant, URL, or event..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchLogs} className="btn-premium" disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <section className="glass-card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Merchant</th>
                                <th>Event / Target</th>
                                <th>Status</th>
                                <th>Payload / Response</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => (
                                <tr key={log.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-white)' }}>
                                            <Clock size={14} color="var(--accent-primary)" />
                                            {new Date(log.created_at).toLocaleTimeString()}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '1.25rem' }}>
                                            {new Date(log.created_at).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 700, color: 'white' }}>{log.merchant_name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'mono' }}>{log.merchant_id.slice(0, 8)}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{log.event_type}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <ExternalLink size={10} />
                                            {log.url.length > 40 ? log.url.slice(0, 40) + '...' : log.url}
                                        </div>
                                    </td>
                                    <td>
                                        {log.response_status ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {log.response_status < 300 ? (
                                                    <CheckCircle2 size={16} color="#4ade80" />
                                                ) : (
                                                    <XCircle size={16} color="#f87171" />
                                                )}
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: log.response_status < 300 ? '#4ade80' : '#f87171'
                                                }}>
                                                    {log.response_status}
                                                </span>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171' }}>
                                                <XCircle size={16} />
                                                <span style={{ fontWeight: 700 }}>FAIL</span>
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{
                                            background: 'rgba(0,0,0,0.3)',
                                            padding: '0.5rem',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontFamily: 'mono',
                                            maxWidth: '400px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            {log.error_message ? (
                                                <span style={{ color: '#f87171' }}>Error: {log.error_message}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>Response: {log.response_body || 'Empty'}</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                                        No webhook transmissions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
