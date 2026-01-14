import { useState } from 'react';
import { adminApi } from '../api';
import { Lock, Sparkles, MoveRight } from 'lucide-react';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await adminApi.login(password);
            localStorage.setItem('admin_token', res.data.token);
            onLogin();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-bg">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="login-card glass-premium">
                <div className="login-header">
                    <div className="logo-icon-wrapper">
                        <Sparkles className="logo-sparkle" size={24} />
                    </div>
                    <h1>Antigravity</h1>
                    <p className="subtitle">Administrator Authentication</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-field">
                        <label>Admin Secret</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-glow"
                                autoFocus
                            />
                        </div>
                    </div>

                    {error && <div className="login-error pulsate">{error}</div>}

                    <button type="submit" className="btn-login-premium" disabled={loading}>
                        <span>{loading ? 'Verifying...' : 'Access Dashboard'}</span>
                        {!loading && <MoveRight size={18} />}
                    </button>
                </form>

                <div className="login-footer">
                    <p>Protected by Antigravity Protocol</p>
                </div>
            </div>

            <style>{`
                .login-page {
                    height: 100vh;
                    width: 100vw;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #020617;
                    overflow: hidden;
                    position: relative;
                    font-family: 'Inter', sans-serif;
                }

                .login-bg {
                    position: absolute;
                    inset: 0;
                    z-index: 0;
                }

                .blob {
                    position: absolute;
                    width: 400px;
                    height: 400px;
                    border-radius: 50%;
                    filter: blur(80px);
                    opacity: 0.15;
                    animation: float 20s infinite alternate;
                }

                .blob-1 { background: #8b5cf6; top: 10%; right: 10%; }
                .blob-2 { background: #3b82f6; bottom: 10%; left: 10%; animation-delay: -5s; }
                .blob-3 { background: #ec4899; top: 40%; left: 30%; animation-delay: -10s; }

                @keyframes float {
                    from { transform: translate(0, 0) scale(1); }
                    to { transform: translate(20px, 40px) scale(1.1); }
                }

                .login-card {
                    width: 100%;
                    max-width: 420px;
                    padding: 3rem;
                    border-radius: 24px;
                    position: relative;
                    z-index: 10;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    text-align: center;
                }

                .glass-premium {
                    background: rgba(15, 23, 42, 0.7);
                    backdrop-filter: blur(20px);
                }

                .logo-icon-wrapper {
                    width: 48px;
                    height: 48px;
                    background: var(--accent-gradient);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    box-shadow: 0 0 20px var(--accent-glow);
                }

                .logo-sparkle { color: white; }

                h1 {
                    font-size: 2rem;
                    font-weight: 800;
                    letter-spacing: -0.025em;
                    margin-bottom: 0.25rem;
                    background: linear-gradient(to bottom right, #fff, #94a3b8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .subtitle {
                    color: #94a3b8;
                    font-size: 0.925rem;
                    margin-bottom: 2.5rem;
                }

                .input-field {
                    text-align: left;
                    margin-bottom: 1.5rem;
                }

                .input-field label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748b;
                    margin-bottom: 0.5rem;
                    margin-left: 0.25rem;
                }

                .input-wrapper {
                    position: relative;
                }

                .input-icon {
                    position: absolute;
                    left: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #475569;
                }

                .input-glow {
                    width: 100%;
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 0.875rem 1rem 0.875rem 3rem;
                    color: white;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }

                .input-glow:focus {
                    outline: none;
                    border-color: #8b5cf6;
                    box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
                    background: rgba(15, 23, 42, 0.8);
                }

                .btn-login-premium {
                    width: 100%;
                    background: var(--accent-gradient);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 1rem;
                    font-weight: 600;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    margin-top: 2rem;
                    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
                }

                .btn-login-premium:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(139, 92, 246, 0.6);
                }

                .btn-login-premium:active:not(:disabled) {
                    transform: translateY(0);
                }

                .btn-login-premium:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                .login-error {
                    color: #ef4444;
                    font-size: 0.85rem;
                    margin-top: 1rem;
                    background: rgba(239, 68, 68, 0.1);
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }

                .pulsate {
                    animation: pulsate 2s infinite;
                }

                @keyframes pulsate {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }

                .login-footer {
                    margin-top: 2.5rem;
                    color: #475569;
                    font-size: 0.75rem;
                    font-weight: 500;
                    letter-spacing: 0.025em;
                }
            `}</style>
        </div>
    );
}
