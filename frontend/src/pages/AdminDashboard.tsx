import { useState } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery } from '@tanstack/react-query';
import type { MetricsResponse } from '../models/MetricsModels';
import type { StockStatus } from '../models/TapModels';

export default function AdminDashboard() {
  const { taps, kegs, users, alerts, createKeg, createTap, updateTap, deleteTap, deleteKeg, createUser, deleteUser, generateQrToken } = useAdmin();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const assignedKegIds = taps.map(t => t.keg_id).filter(Boolean) as string[];
  const availableKegs = kegs.filter(k => !assignedKegIds.includes(k.id));

  const [activeTab, setActiveTab] = useState<'taps' | 'kegs' | 'add-tap' | 'users' | 'metrics'>('taps');

  // Fetch Metrics
  const { data: metrics, isLoading: isMetricsLoading } = useQuery<MetricsResponse>({
    queryKey: ['billingMetrics'],
    queryFn: async () => {
      const response = await fetch('/api/billing/metrics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Error al obtener métricas');
      return response.json();
    },
    enabled: activeTab === 'metrics',
    refetchInterval: 10000, // Refresh every 10s
  });


  // Form states for creating a Keg
  const [kegName, setKegName] = useState('');
  const [kegStyle, setKegStyle] = useState('');
  const [kegCapacity, setKegCapacity] = useState(25000);
  const [kegError, setKegError] = useState('');
  const [kegSuccess, setKegSuccess] = useState('');

  // Form states for creating a Tap
  const [tapCode, setTapCode] = useState('');
  const [tapName, setTapName] = useState('');
  const [tapPrice, setTapPrice] = useState(0.0065);
  const [tapKegId, setTapKegId] = useState('');
  const [tapError, setTapError] = useState('');
  const [tapSuccess, setTapSuccess] = useState('');

  // Editing tap state
  const [editingTapId, setEditingTapId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editKegId, setEditKegId] = useState('');

  // User management states
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userError, setUserError] = useState('');
  
  // QR Modal states
  const [qrToken, setQrToken] = useState('');
  const [qrUsername, setQrUsername] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);


  // Replacing keg state
  const [replacingTapId, setReplacingTapId] = useState<string | null>(null);
  const [selectedKegIdForReplace, setSelectedKegIdForReplace] = useState<string>('');

  const handleConfirmReplace = async (tapId: string) => {
    if (!selectedKegIdForReplace) return;
    try {
      await updateTap(tapId, { keg_id: selectedKegIdForReplace });
      setReplacingTapId(null);
      setSelectedKegIdForReplace('');
    } catch (err) {
      alert('Error al reemplazar el barril');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const handleDeleteTap = async (tapId: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el grifo ${tapId}?`)) return;
    try {
      await deleteTap(tapId);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el grifo');
    }
  };

  const handleDeleteKeg = async (kegId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este barril? Se desasociará de cualquier grifo.')) return;
    try {
      await deleteKeg(kegId);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el barril');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este cliente?')) return;
    try {
      await deleteUser(userId);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar cliente');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    try {
      const newUser = await createUser({ username: newUsername, password: newUserPassword, role: 'CUSTOMER' });
      const token = await generateQrToken(newUser.id);
      setQrToken(token);
      setQrUsername(newUser.username);
      setShowQrModal(true);
      setNewUsername('');
      setNewUserPassword('');
    } catch (err: any) {
      setUserError(err.message || 'Error al crear cliente');
    }
  };

  const handleShowQrForUser = async (userId: number, username: string) => {
    try {
      const token = await generateQrToken(userId);
      setQrToken(token);
      setQrUsername(username);
      setShowQrModal(true);
    } catch (err: any) {
      alert('Error al generar QR');
    }
  };


  const handleCreateKeg = async (e: React.FormEvent) => {
    e.preventDefault();
    setKegError('');
    setKegSuccess('');
    try {
      await createKeg({
        name: kegName,
        beer_style: kegStyle || undefined,
        capacity_ml: kegCapacity
      });
      setKegSuccess('¡Barril creado con éxito!');
      setKegName('');
      setKegStyle('');
    } catch (err: any) {
      setKegError(err.message || 'Error al crear el barril');
    }
  };

  const handleCreateTap = async (e: React.FormEvent) => {
    e.preventDefault();
    setTapError('');
    setTapSuccess('');
    try {
      await createTap({
        tap_code: tapCode,
        name: tapName || undefined,
        price_per_ml: tapPrice,
        keg_id: tapKegId || undefined
      });
      setTapSuccess('¡Grifo creado con éxito!');
      setTapCode('');
      setTapName('');
      setTapPrice(0.0065);
      setTapKegId('');
    } catch (err: any) {
      setTapError(err.message || 'Error al crear el grifo');
    }
  };

  const startEditing = (tap: StockStatus) => {
    setEditingTapId(tap.tap_id);
    setEditName(tap.name || '');
    setEditPrice(0.0065); 
    setEditKegId(tap.keg_id || '');
  };

  const handleUpdateTap = async (tapId: string) => {
    try {
      await updateTap(tapId, {
        name: editName || undefined,
        price_per_ml: editPrice || undefined,
        keg_id: editKegId || undefined
      });
      setEditingTapId(null);
    } catch (err) {
      alert('Error al actualizar el grifo');
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Container wrapper */}
      <div className="w-full max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8 flex-1">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Panel de Control <span className="text-purple-400">BeerFlow</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Administración de grifos, depósitos de barriles y tipos de cerveza
            </p>
          </div>
          <button 
            onClick={handleLogout} 
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 hover:text-purple-400 text-slate-300 font-semibold rounded-xl text-sm transition-all duration-200"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* Alerts Panel */}
        {alerts.length > 0 && (
          <div className="p-5 bg-rose-950/20 border border-rose-900/40 rounded-2xl shadow-lg shadow-rose-950/10 flex flex-col gap-3">
            <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
              <span className="animate-pulse">🔴</span> Alertas de Stock Crítico
            </h3>
            <ul className="pl-5 list-disc text-sm text-rose-300/80 space-y-1.5">
              {alerts.slice(-5).map((alert, i) => (
                <li key={i}>{alert}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex border-b border-slate-800 gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('taps')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
              activeTab === 'taps' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🚰 Inventario de Grifos
          </button>
          <button
            onClick={() => setActiveTab('kegs')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
              activeTab === 'kegs' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🛢️ Depósitos de Barriles
          </button>
          <button
            onClick={() => setActiveTab('add-tap')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
              activeTab === 'add-tap' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ➕ Añadir Nuevo Grifo
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
              activeTab === 'users' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👥 Clientes
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
              activeTab === 'metrics' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📊 Métricas y Consumos
          </button>
        </nav>

        {/* Tab Contents */}

        <main className="flex-1">
          
          {/* TAPS TAB */}
          {activeTab === 'taps' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {taps.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-500 bg-slate-900/20 border border-slate-800/80 rounded-2xl">
                  No hay grifos registrados en el sistema.
                </div>
              ) : (
                taps.map((tap) => {
                  const associatedKeg = kegs.find((k) => k.id === tap.keg_id);
                  const isEditing = editingTapId === tap.tap_id;

                  return (
                    <div 
                      key={tap.tap_id} 
                      className={`relative bg-slate-900/40 backdrop-blur-sm border rounded-2xl p-6 flex flex-col gap-5 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
                        tap.is_low_stock 
                          ? 'border-rose-500/40 hover:border-rose-500/60 bg-rose-950/5' 
                          : 'border-slate-800/80 hover:border-purple-500/20'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white tracking-tight">
                            {tap.name || tap.tap_id}
                          </h3>
                          <code className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md mt-1.5 inline-block">
                            {tap.tap_id}
                          </code>
                        </div>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          tap.is_low_stock 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {tap.is_low_stock ? 'Stock Bajo' : 'Normal'}
                        </span>
                      </div>

                      {/* Beer Style */}
                      <div className="text-sm text-slate-400 flex items-center gap-2">
                        <span>Estilo:</span>
                        <strong className="text-slate-200 font-semibold">
                          {associatedKeg?.beer_style || 'Sin barril asignado'}
                        </strong>
                      </div>

                      {/* Progress Bar */}
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400 font-medium">Nivel de Barril:</span>
                          <span className={`font-bold ${tap.is_low_stock ? 'text-rose-400' : 'text-purple-400'}`}>
                            {tap.percentage_left.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden p-[1px]">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              tap.is_low_stock ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-gradient-to-r from-purple-500 to-indigo-600'
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, tap.percentage_left))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 text-right mt-0.5">
                          {tap.current_volume_ml.toFixed(0)} ml / {associatedKeg?.capacity_ml || 25000} ml
                        </div>
                      </div>

                      {/* Edit Mode vs Display Mode */}
                      {isEditing ? (
                        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col gap-3.5 mt-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-400">Nombre del Grifo</label>
                            <input 
                              type="text" 
                              value={editName} 
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-400">Precio por ml (€)</label>
                            <input 
                              type="number" 
                              step="0.0001" 
                              value={editPrice} 
                              onChange={(e) => setEditPrice(parseFloat(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-400">Asociar Barril</label>
                            <select 
                              value={editKegId} 
                              onChange={(e) => setEditKegId(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                              <option value="">-- Sin Barril --</option>
                              {kegs.map(k => (
                                <option key={k.id} value={k.id} className="bg-slate-950">
                                  {k.name} ({k.beer_style || 'Sin estilo'}) - {k.remaining_ml}ml
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex gap-2 mt-2">
                            <button 
                              onClick={() => handleUpdateTap(tap.tap_id)}
                              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button 
                              onClick={() => setEditingTapId(null)}
                              className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : replacingTapId === tap.tap_id ? (
                        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col gap-3.5 mt-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-400">Seleccionar Barril Libre</label>
                            {availableKegs.length === 0 ? (
                              <p className="text-xs text-rose-400 bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/30">
                                No hay barriles libres en el sistema. Crea uno nuevo en la pestaña <strong>Depósitos de Barriles</strong>.
                              </p>
                            ) : (
                              <select 
                                value={selectedKegIdForReplace} 
                                onChange={(e) => setSelectedKegIdForReplace(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                              >
                                <option value="">-- Seleccionar Barril --</option>
                                {availableKegs.map(k => (
                                  <option key={k.id} value={k.id} className="bg-slate-950">
                                    {k.name} ({k.beer_style || 'Sin estilo'}) - {k.remaining_ml}ml
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <div className="flex gap-2 mt-2">
                            {availableKegs.length > 0 && (
                              <button 
                                onClick={() => handleConfirmReplace(tap.tap_id)}
                                disabled={!selectedKegIdForReplace}
                                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                Confirmar
                              </button>
                            )}
                            <button 
                              onClick={() => { setReplacingTapId(null); setSelectedKegIdForReplace(''); }}
                              className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2.5 mt-auto pt-4 border-t border-slate-900/60">
                          <button
                            onClick={() => {
                              setReplacingTapId(tap.tap_id);
                              setSelectedKegIdForReplace('');
                            }}
                            className={`flex-grow py-2 px-3 text-xs font-bold text-white rounded-xl transition-all duration-200 cursor-pointer shadow-md ${
                              tap.is_low_stock 
                                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/20' 
                                : 'bg-purple-600 hover:bg-purple-500 shadow-purple-950/20'
                            }`}
                          >
                            🔄 Reemplazar
                          </button>
                          <button
                            onClick={() => startEditing(tap)}
                            className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer"
                          >
                            ⚙️ Editar
                          </button>
                          <button
                            onClick={() => handleDeleteTap(tap.tap_id)}
                            className="py-2 px-3 bg-rose-900/20 hover:bg-rose-900/40 border border-rose-900/30 hover:border-rose-900/50 text-rose-400 hover:text-rose-300 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer"
                            title="Eliminar grifo"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* KEGS TAB */}
          {activeTab === 'kegs' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Create Keg Form */}
              <form 
                onSubmit={handleCreateKeg}
                className="lg:col-span-1 bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-6 rounded-2xl flex flex-col gap-4.5 h-fit shadow-md"
              >
                <h3 className="text-base font-bold text-white">Crear Nuevo Barril</h3>

                {kegError && <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">{kegError}</p>}
                {kegSuccess && <p className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 p-2.5 rounded-lg">{kegSuccess}</p>}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Nombre del Barril</label>
                  <input 
                    type="text" 
                    value={kegName} 
                    onChange={(e) => setKegName(e.target.value)}
                    placeholder="ej. Barril IPA Artesanal"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Estilo de Cerveza (Tipo)</label>
                  <input 
                    type="text" 
                    value={kegStyle} 
                    onChange={(e) => setKegStyle(e.target.value)}
                    placeholder="ej. IPA, Lager, Stout, Porter"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Capacidad Total (ml)</label>
                  <input 
                    type="number" 
                    value={kegCapacity} 
                    onChange={(e) => setKegCapacity(parseInt(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all cursor-pointer text-sm"
                >
                  Crear Barril
                </button>
              </form>

              {/* Kegs List */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <h3 className="text-base font-bold text-white">Barriles Existentes</h3>
                
                <div className="w-full overflow-hidden border border-slate-800/80 rounded-2xl bg-slate-900/20 backdrop-blur-sm shadow-md">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800">
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Nombre</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Estilo</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Stock Actual</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Capacidad</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {kegs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 px-4 text-center text-sm text-slate-500">
                              No hay barriles registrados.
                            </td>
                          </tr>
                        ) : (
                          kegs.map(keg => (
                            <tr key={keg.id} className="hover:bg-slate-900/30 transition-colors">
                              <td className="py-3.5 px-4 text-sm font-semibold text-white">{keg.name}</td>
                              <td className="py-3.5 px-4 text-sm">
                                <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/25 text-xs font-semibold rounded-md">
                                  {keg.beer_style || 'N/A'}
                                </span>
                              </td>
                              <td className={`py-3.5 px-4 text-sm font-bold ${keg.remaining_ml <= 2500 ? 'text-rose-400' : 'text-slate-200'}`}>
                                {keg.remaining_ml.toLocaleString()} ml
                              </td>
                              <td className="py-3.5 px-4 text-sm text-slate-400">{keg.capacity_ml.toLocaleString()} ml</td>
                              <td className="py-3.5 px-4 text-sm text-right">
                                <button
                                  onClick={() => handleDeleteKeg(keg.id)}
                                  className="p-1.5 bg-rose-900/20 hover:bg-rose-900/40 border border-rose-900/30 hover:border-rose-900/50 text-rose-400 hover:text-rose-300 rounded-lg transition-all duration-200 cursor-pointer"
                                  title="Eliminar barril"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ADD TAP TAB */}
          {activeTab === 'add-tap' && (
            <div className="max-w-xl mx-auto">
              <form 
                onSubmit={handleCreateTap}
                className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-8 rounded-2xl flex flex-col gap-5.5 shadow-md"
              >
                <h3 className="text-lg font-bold text-white tracking-tight">Añadir Nuevo Grifo al Sistema</h3>

                {tapError && <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 p-3 rounded-xl">{tapError}</p>}
                {tapSuccess && <p className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-xl">{tapSuccess}</p>}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Identificador del Grifo (tap_code)</label>
                  <input 
                    type="text" 
                    value={tapCode} 
                    onChange={(e) => setTapCode(e.target.value)}
                    placeholder="ej. tap-003"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">Código único para emparejar con el caudalímetro físico/simulador</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Nombre Descriptivo</label>
                  <input 
                    type="text" 
                    value={tapName} 
                    onChange={(e) => setTapName(e.target.value)}
                    placeholder="ej. Grifo 3 — Stout Negra"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Precio por mililitro (€/ml)</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    value={tapPrice} 
                    onChange={(e) => setTapPrice(parseFloat(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">0.0065 €/ml equivale a 6.50€ por Litro</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Asociar Barril Activo (Opcional)</label>
                  <select 
                    value={tapKegId} 
                    onChange={(e) => setTapKegId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="" className="bg-slate-950">-- No asociar ningún barril por ahora --</option>
                    {kegs.map(k => (
                      <option key={k.id} value={k.id} className="bg-slate-950">
                        {k.name} ({k.beer_style || 'Sin estilo'}) - {k.remaining_ml}ml restantes
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all cursor-pointer text-sm"
                >
                  Registrar Grifo
                </button>
              </form>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Create User Form */}
              <form 
                onSubmit={handleCreateUser}
                className="lg:col-span-1 bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-6 rounded-2xl flex flex-col gap-4.5 h-fit shadow-md"
              >
                <h3 className="text-base font-bold text-white">Registrar Cliente</h3>

                {userError && <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">{userError}</p>}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Usuario / Alias</label>
                  <input 
                    type="text" 
                    value={newUsername} 
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ej. JuanPerez"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Contraseña (Opcional)</label>
                  <input 
                    type="password" 
                    value={newUserPassword} 
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Dejar vacío para auto-generar"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all cursor-pointer text-sm"
                >
                  Generar QR de Acceso
                </button>
              </form>

              {/* Users List */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <h3 className="text-base font-bold text-white">Clientes Registrados</h3>
                <div className="w-full overflow-hidden border border-slate-800/80 rounded-2xl bg-slate-900/20 backdrop-blur-sm shadow-md">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800">
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">ID</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Usuario</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Rol</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 px-4 text-center text-sm text-slate-500">
                              No hay usuarios registrados.
                            </td>
                          </tr>
                        ) : (
                          users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-900/30 transition-colors">
                              <td className="py-3.5 px-4 text-sm font-semibold text-slate-400">#{u.id}</td>
                              <td className="py-3.5 px-4 text-sm font-bold text-white">{u.username}</td>
                              <td className="py-3.5 px-4 text-sm">
                                <span className={`px-2.5 py-0.5 border text-xs font-semibold rounded-md ${
                                  u.role === 'ADMIN' ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' : 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-sm text-right flex justify-end gap-2">
                                <button
                                  onClick={() => handleShowQrForUser(u.id, u.username)}
                                  className="p-1.5 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-900/30 hover:border-purple-900/50 text-purple-400 hover:text-purple-300 rounded-lg transition-all duration-200 cursor-pointer"
                                  title="Mostrar QR"
                                >
                                  📱
                                </button>
                                {u.role !== 'ADMIN' && (
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="p-1.5 bg-rose-900/20 hover:bg-rose-900/40 border border-rose-900/30 hover:border-rose-900/50 text-rose-400 hover:text-rose-300 rounded-lg transition-all duration-200 cursor-pointer"
                                    title="Eliminar usuario"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* METRICS TAB */}
          {activeTab === 'metrics' && (
            <div className="flex flex-col gap-8">
              {isMetricsLoading ? (
                <div className="py-16 text-center text-slate-400 animate-pulse">Cargando métricas...</div>
              ) : !metrics ? (
                <div className="py-16 text-center text-rose-400">Error al cargar las métricas.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Top Customers */}
                    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-6 rounded-2xl flex flex-col gap-4 shadow-md">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">🏆 Top Clientes (Gasto)</h3>
                      <div className="flex flex-col gap-3">
                        {metrics.top_customers.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">Sin datos registrados.</p>
                        ) : (
                          metrics.top_customers.map((c: any, i: number) => {
                            const maxEur = Math.max(...metrics.top_customers.map((x: any) => x.total_eur));
                            const percentage = maxEur > 0 ? (c.total_eur / maxEur) * 100 : 0;
                            return (
                              <div key={i} className="flex flex-col gap-1.5">
                                <div className="flex justify-between text-sm">
                                  <span className="font-semibold text-slate-300">{i + 1}. {c.username}</span>
                                  <span className="font-bold text-purple-400">€{c.total_eur.toFixed(2)} <span className="text-xs text-slate-500 font-normal ml-1">({c.total_ml.toFixed(0)}ml)</span></span>
                                </div>
                                <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 ease-out"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Popular Beer Styles */}
                    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-6 rounded-2xl flex flex-col gap-4 shadow-md">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">🍺 Popularidad por Estilo</h3>
                      <div className="flex flex-col gap-3">
                        {metrics.beer_styles.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">Sin datos registrados.</p>
                        ) : (
                          metrics.beer_styles.map((b: any, i: number) => {
                            const maxMl = Math.max(...metrics.beer_styles.map((x: any) => x.total_ml));
                            const percentage = maxMl > 0 ? (b.total_ml / maxMl) * 100 : 0;
                            return (
                              <div key={i} className="flex flex-col gap-1.5">
                                <div className="flex justify-between text-sm">
                                  <span className="font-semibold text-slate-300">{b.beer_style}</span>
                                  <span className="font-bold text-emerald-400">{b.total_ml.toFixed(0)} ml <span className="text-xs text-slate-500 font-normal ml-1">(€{b.total_eur.toFixed(2)})</span></span>
                                </div>
                                <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000 ease-out"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recent Consumptions Table */}
                  <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl flex flex-col shadow-md overflow-hidden">
                    <div className="p-6 border-b border-slate-800/80">
                      <h3 className="text-base font-bold text-white">⏱️ Historial Reciente de Consumos</h3>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900/80 border-b border-slate-800">
                            <th className="py-3 px-6 text-xs font-bold uppercase text-slate-400 tracking-wider">Fecha y Hora</th>
                            <th className="py-3 px-6 text-xs font-bold uppercase text-slate-400 tracking-wider">Cliente</th>
                            <th className="py-3 px-6 text-xs font-bold uppercase text-slate-400 tracking-wider">Grifo / Estilo</th>
                            <th className="py-3 px-6 text-xs font-bold uppercase text-slate-400 tracking-wider text-right">Volumen</th>
                            <th className="py-3 px-6 text-xs font-bold uppercase text-slate-400 tracking-wider text-right">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {metrics.recent.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 px-6 text-center text-sm text-slate-500">
                                Aún no se ha registrado ningún consumo.
                              </td>
                            </tr>
                          ) : (
                            metrics.recent.map((r: any, i: number) => {
                              const date = new Date(r.date);
                              return (
                                <tr key={i} className="hover:bg-slate-900/30 transition-colors">
                                  <td className="py-3.5 px-6 text-sm text-slate-400">
                                    {date.toLocaleDateString()} <span className="text-xs ml-1 opacity-70">{date.toLocaleTimeString()}</span>
                                  </td>
                                  <td className="py-3.5 px-6 text-sm font-bold text-white">{r.username}</td>
                                  <td className="py-3.5 px-6 text-sm">
                                    <div className="flex flex-col">
                                      <span className="text-slate-300 font-medium">{r.tap_id}</span>
                                      <span className="text-xs text-purple-400">{r.beer_style}</span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-6 text-sm font-semibold text-slate-300 text-right">{r.ml_served.toFixed(1)} ml</td>
                                  <td className="py-3.5 px-6 text-sm font-bold text-emerald-400 text-right">€{r.total_amount.toFixed(2)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </main>
      </div>

      {/* QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center shadow-2xl relative">
            <button 
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-white mb-2 text-center">Pulsera Virtual</h3>
            <p className="text-sm text-slate-400 mb-6 text-center">
              Haz una foto de este código QR. Sirve para desbloquear los grifos a nombre de <strong className="text-purple-400">{qrUsername}</strong>.
            </p>
            <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
              <QRCodeSVG value={qrToken} size={280} level="L" includeMargin={true} />
            </div>
            <button 
              onClick={() => setShowQrModal(false)}

              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

