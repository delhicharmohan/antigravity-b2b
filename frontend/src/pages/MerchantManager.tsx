import { useState, useEffect } from 'react';
import { adminApi } from '../api';
import { Plus, Copy, Users, ShieldCheck, Calendar, Key, Edit2, Trash2, X } from 'lucide-react';

export default function MerchantManager() {
    const [merchants, setMerchants] = useState<any[]>([]);
    const [newName, setNewName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [editingMerchant, setEditingMerchant] = useState<any | null>(null);
    const [editConfig, setEditConfig] = useState({ name: '', rake: 0, allowed_ipsStr: '', webhook_url: '' });

    const fetchMerchants = async () => {
        try {
            const res = await adminApi.listMerchants();
            setMerchants(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchMerchants();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName) return;

        try {
            const res = await adminApi.createMerchant(newName);
            setNewKey(res.data.apiKey);
            setNewName('');
            fetchMerchants();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this merchant? This will also delete all associated transactions and wagers.')) return;
        try {
            await adminApi.deleteMerchant(id);
            fetchMerchants();
        } catch (error) {
            console.error(error);
            alert('Failed to delete merchant');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMerchant) return;
        try {
            await adminApi.updateMerchant(editingMerchant.id, {
                ...editingMerchant.config,
                name: editConfig.name,
                default_rake: Number(editConfig.rake),
                allowed_ips: editConfig.allowed_ipsStr.split(',').map(ip => ip.trim()).filter(ip => ip),
                webhook_url: editConfig.webhook_url || null
            });
            setEditingMerchant(null);
            fetchMerchants();
        } catch (error) {
            console.error(error);
            alert('Failed to update merchant');
        }
    };

    return (
        <div className="animate-slide-up">
            <header style={{ marginBottom: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                    <Users size={20} />
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem' }}>Partners</span>
                </div>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Merchant Ecosystem</h2>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
                <section className="glass-card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                            <ShieldCheck size={18} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Onboard New Partner</h3>
                    </div>

                    <form onSubmit={handleCreate} style={{ display: 'flex', gap: '1rem' }}>
                        <input
                            className="input-glow"
                            placeholder="Partner Institution Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <button type="submit" className="btn-premium" style={{ whiteSpace: 'nowrap' }}>
                            <Plus size={20} /> Onboard
                        </button>
                    </form>

                    {newKey && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '1.25rem',
                            background: 'rgba(245, 158, 11, 0.05)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                <Key size={14} />
                                SECURE API ACCESS KEY
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
                                Copy this key now. It will not be shown again for security reasons.
                            </p>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                fontFamily: '"JetBrains Mono", monospace',
                                background: 'rgba(0,0,0,0.4)',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{newKey}</span>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(newKey);
                                        alert('API Key copied to clipboard!');
                                    }}
                                    className="btn-premium"
                                    style={{ padding: '0.4rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
                                    title="Copy Key"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(217, 70, 239, 0.1) 100%)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '0.5rem' }}>{merchants.length}</div>
                        <div style={{ color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>Verified Partners</div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '1rem', maxWidth: '250px', margin: '1rem auto 0' }}>
                            Managing the global liquidity network of Antigravity B2B nodes.
                        </p>
                    </div>
                </div>
            </div>

            <section className="glass-card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Partner Identity</th>
                                <th>API Access</th>
                                <th>Revenue Share</th>
                                <th>Onboarding Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {merchants.map(m => (
                                <tr key={m.id}>
                                    <td>
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{m.config?.name || 'Anonymous Partner'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: '"JetBrains Mono", monospace' }}>ID: {m.id.slice(0, 18)}...</div>
                                    </td>
                                    <td>
                                        <div
                                            onClick={() => {
                                                if (m.raw_api_key) {
                                                    navigator.clipboard.writeText(m.raw_api_key);
                                                    alert('API Key copied into vault!');
                                                }
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                fontFamily: '"JetBrains Mono", monospace',
                                                background: 'rgba(255,255,255,0.03)',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '8px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                color: 'var(--text-dim)',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                transition: 'all 0.2s'
                                            }}
                                            className="hover-glow"
                                            title="Click to copy API Key"
                                        >
                                            <span style={{ filter: 'blur(4px)', opacity: 0.5, fontSize: '0.8rem' }}>{m.raw_api_key ? m.raw_api_key.slice(0, 12) + '...' : '••••••••••••'}</span>
                                            <Copy size={12} />
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge badge-purple">
                                            {(m.config?.default_rake * 100).toFixed(1)}% RAKE
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                            <Calendar size={14} />
                                            {new Date(m.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => {
                                                    setEditingMerchant(m);
                                                    setEditConfig({
                                                        name: m.config.name,
                                                        rake: m.config.default_rake,
                                                        allowed_ipsStr: (m.config.allowed_ips || []).join(', '),
                                                        webhook_url: m.config.webhook_url || ''
                                                    });
                                                }}
                                                className="btn-premium"
                                                style={{ padding: '0.4rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(m.id)}
                                                className="btn-premium"
                                                style={{ padding: '0.4rem', borderRadius: '6px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {editingMerchant && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="glass-card animate-scale-up" style={{ width: '400px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Edit Merchant</h3>
                            <button onClick={() => setEditingMerchant(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label className="label">Merchant Name</label>
                                <input
                                    className="input-glow"
                                    value={editConfig.name}
                                    onChange={e => setEditConfig({ ...editConfig, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Default Rake (0.0 to 1.0)</label>
                                <input
                                    className="input-glow"
                                    type="number"
                                    step="0.01"
                                    value={editConfig.rake}
                                    onChange={e => setEditConfig({ ...editConfig, rake: Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="label">Allowed IPs (Comma separated)</label>
                                <input
                                    className="input-glow"
                                    placeholder="e.g. 127.0.0.1, ::1"
                                    value={editConfig.allowed_ipsStr}
                                    onChange={e => setEditConfig({ ...editConfig, allowed_ipsStr: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Webhook URL</label>
                                <input
                                    className="input-glow"
                                    placeholder="https://merchant.com/api/webhooks/antigravity"
                                    value={editConfig.webhook_url}
                                    onChange={e => setEditConfig({ ...editConfig, webhook_url: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn-premium" style={{ marginTop: '1rem', justifyContent: 'center' }}>
                                Save Changes
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
