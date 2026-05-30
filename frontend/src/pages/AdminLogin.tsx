import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_BILLING_URL || 'http://localhost:8001';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const form = new URLSearchParams();
      form.append('username', username);
      form.append('password', password);

      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
      });

      if (!res.ok) {
        throw new Error('Credenciales incorrectas');
      }

      const data = await res.json();
      if (data.role !== 'ADMIN') {
        throw new Error('Acceso denegado: Se requiere rol de Administrador');
      }

      login(data.access_token);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }} className="w-full flex items-center justify-center bg-radial from-slate-900 via-gray-950 to-black px-4 py-12">
      <div className="w-full max-w-md bg-gray-900/60 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:border-purple-500/30">

        {/* Header/Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
            <img src="/beer.png" className="w-8 h-8 object-contain" alt="Beer Icon" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Beer<span className="text-purple-400">Flow</span> Admin
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            Inicia sesión para gestionar el sistema de grifos
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-sm text-red-400 flex items-center gap-3 animate-pulse">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Usuario
            </label>
            <input
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-purple-900/20 hover:shadow-purple-500/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Ingresar al panel'
            )}
          </button>
        </form>

        {/* Back Link */}
        <div className="text-center mt-6">
          <a
            href="/"
            className="text-xs text-gray-500 hover:text-purple-400 transition-colors duration-200"
          >
            ← Volver a la pantalla pública
          </a>
        </div>

      </div>
    </div>
  );
}
