import { useState, useEffect } from 'react';
import { adminApi } from '../api';
import { Receipt, Search, ArrowUpRight, Clock } from 'lucide-react';

export default function WagerLedger() {
    const [wagers, setWagers] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchWagers = async () => {
        try {
            const res = await adminApi.listWagers();
            setWagers(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchWagers();
        const interval = setInterval(fetchWagers, 30000);
        return () => clearInterval(interval);
    }, []);

    const filteredWagers = wagers.filter(w => {
        const title = (w.market_title || '').toLowerCase();
        const merchant = (w.merchant_name || '').toLowerCase();
        const id = (w.id || '').toLowerCase();
        const search = searchTerm.toLowerCase();

        return title.includes(search) || merchant.includes(search) || id.includes(search);
    });

    return (
        <div className="animate-slide-up">
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                        <Receipt size={20} />
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem' }}>Audit Log</span>
                    </div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Wager Ledger</h2>
                </div>

                <div style={{ width: '400px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        className="input-glow"
                        style={{ paddingLeft: '3rem' }}
                        placeholder="Search by market, merchant, or ID..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <section className="glass-card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Transaction ID</th>
                                <th>Market / Merchant</th>
                                <th>Stake / Side</th>
                                <th>Payout Status</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredWagers.map(w => (
                                <tr key={w.id}>
                                    <td>
                                        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.85rem' }}>
                                            {w.id.slice(0, 18)}...
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: 'white' }}>{w.market_title}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>via {w.merchant_name}</div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                                            ${Number(w.stake).toLocaleString()}
                                            <span className={w.selection === 'yes' ? 'badge badge-success' : 'badge badge-accent'} style={{ fontSize: '0.65rem' }}>
                                                {w.selection.toUpperCase()}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        {w.status === 'SETTLED' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                    color: Number(w.payout) > 0 ? '#4ade80' : 'var(--text-muted)',
                                                    fontWeight: 700
                                                }}>
                                                    ${Number(w.payout).toLocaleString()}
                                                </span>
                                                {Number(w.payout) > 0 ? <ArrowUpRight size={14} color="#4ade80" /> : null}
                                            </div>
                                        ) : w.status === 'VOIDED' ? (
                                            <span className="badge">REFUNDED</span>
                                        ) : (
                                            <span className="badge" style={{ opacity: 0.5 }}>PENDING</span>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                            <Clock size={14} />
                                            {new Date(w.created_at).toLocaleString()}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
