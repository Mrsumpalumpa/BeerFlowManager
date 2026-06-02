import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBeerWebSocket } from '../hooks/useBeerWebSocket';
import BeerGlass from '../components/BeerGlass';
import PriceCounter from '../components/PriceCounter';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import type { Tap } from '../models/TapModels';


const API_URL = import.meta.env.VITE_TAP_MANAGEMENT_URL || 'http://localhost:8002';

export default function PublicTapUI() {
  const queryClient = useQueryClient();
  const [tapId, setTapId] = useState('tap-001');

  // Query for the list of available/active taps
  const { data: taps = [], isLoading } = useQuery<Tap[]>({
    queryKey: ['publicTaps'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/taps`);
      if (!response.ok) throw new Error('Error al obtener la lista de grifos');
      return response.json();
    }
  });

  // Auto-select the first tap when the list loads if tapId isn't valid or is blocked
  useEffect(() => {
    if (taps.length > 0) {
      const activeTap = taps.find((t) => t.tap_code === tapId);
      if (!activeTap || activeTap.is_blocked) {
        const firstAvailable = taps.find((t) => !t.is_blocked);
        if (firstAvailable) {
          setTapId(firstAvailable.tap_code);
        } else {
          setTapId(taps[0].tap_code);
        }
      }
    }
  }, [taps, tapId]);

  const { ml_total, price_current, status, isConnected, customer_id } = useBeerWebSocket(tapId);
  const [isLocked, setIsLocked] = useState(true);
  const [scanError, setScanError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isLocked) {
      scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 15,
          qrbox: { width: 300, height: 300 },
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          aspectRatio: 1.0
        },
        false
      );
      scanner.render(async (decodedText) => {

        if (isUnlocking) return;
        setIsUnlocking(true);
        setScanError('');
        try {
          const decoded: any = jwtDecode(decodedText);
          const customerId = decoded.sub;

          if (!customerId) throw new Error('QR Inválido');
          
          const WS_URL = import.meta.env.VITE_BEERFLOW_WS_URL || 'ws://localhost:8000';
          const isProd = WS_URL.includes('8080') || WS_URL.includes('/ws'); // Nginx routes via /ws or 8080
          const basePath = isProd ? '/api/beerflow' : '';
          const BEERFLOW_URL = WS_URL.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

          // Call unlock endpoint
          const res = await fetch(`${BEERFLOW_URL}${basePath}/sensor/unlock`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tap_id: tapId, customer_id: customerId })
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Error ${res.status}: ${errText}`);
          }


          if (scanner) {
            scanner.clear().catch(console.error);
            scanner = null;
          }
          setIsLocked(false);
        } catch (err: any) {
          setScanError(err.message || 'Error validando QR');
          setTimeout(() => setScanError(''), 3000);
        } finally {
          setIsUnlocking(false);
        }
      }, () => {
        // ignore scan errors
      });
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [isLocked, tapId, isUnlocking]);

  // Re-lock when session closes
  useEffect(() => {
    if (!isLocked && status === 'closed' && ml_total > 0) {
      const timer = setTimeout(() => {
        setIsLocked(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, isLocked, ml_total]);

  // Auto-unlock if session is open (e.g. page refresh or external unlock)
  useEffect(() => {
    if (status === 'open' && isLocked) {
      setIsLocked(false);
    }
  }, [status, isLocked]);

  const handleRefreshTaps = () => {
    queryClient.invalidateQueries({ queryKey: ['publicTaps'] });
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-slate-900 to-gray-950 text-gray-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">

      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Floating Header */}
      <header className="absolute top-6 left-6 right-6 flex flex-col sm:flex-row gap-4 items-center justify-between z-20">
        <div className="flex items-center gap-3 bg-gray-900/60 backdrop-blur-md border border-gray-800/80 px-4 py-2 rounded-xl">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Grifo Activo:</label>
          <div className="flex items-center gap-1.5">
            <select
              value={tapId}
              onChange={(e) => setTapId(e.target.value)}
              className="bg-transparent text-sm font-bold text-white border-none focus:ring-0 cursor-pointer outline-none max-w-[200px] truncate"
              disabled={isLoading || taps.length === 0}
            >
              {isLoading ? (
                <option className="bg-gray-950">Cargando...</option>
              ) : taps.length === 0 ? (
                <option className="bg-gray-950">Sin grifos</option>
              ) : (
                taps.map((t) => (
                  <option
                    key={t.tap_code}
                    value={t.tap_code}
                    className={`bg-gray-950 ${t.is_blocked ? 'text-gray-500 line-through' : 'text-white'}`}
                    disabled={t.is_blocked}
                  >
                    {t.is_blocked
                      ? `🚫 ${t.name} (Bloqueado - ${Math.round(t.percentage_left)}%)`
                      : `${t.name} (${t.tap_code})`}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={handleRefreshTaps}
              title="Refrescar lista de grifos"
              className="p-1 hover:bg-white/10 rounded text-xs transition-colors cursor-pointer text-gray-400 hover:text-white"
            >
              🔄
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-md border border-gray-800/80 px-3 py-1.5 rounded-xl">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-pulse'}`} />
            <span className="text-xs font-medium text-gray-300">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>

          <a
            href="/admin/login"
            className="text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-3.5 py-1.5 rounded-xl transition-all duration-200"
          >
            Panel Admin →
          </a>
        </div>
      </header>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl text-center flex flex-col items-center gap-8 mt-48 sm:mt-0 z-10"
      >
        <div>
          <h1 className="text-5xl sm:my-15 sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-purple-400 tracking-tight leading-none mb-3">
            BeerFlow
          </h1>
          <p className="text-lg text-gray-400 font-light max-w-md mx-auto">
            Acerca tu jarra y sírvete directamente desde el grifo.
          </p>
        </div>

        {isLocked ? (
          <div className="w-full max-w-md bg-gray-900/40 backdrop-blur-md border border-gray-800/60 p-8 rounded-3xl flex flex-col items-center gap-6 shadow-xl relative mt-8">
            <h2 className="text-2xl font-bold text-white">Desbloquear Grifo</h2>
            <p className="text-sm text-gray-400">Escanea tu pulsera virtual (QR) para comenzar a servirte.</p>

            {scanError && (
              <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm py-2 px-4 rounded-xl">
                {scanError}
              </div>
            )}

            <div id="reader" className="w-full bg-black rounded-xl overflow-hidden border-2 border-gray-800"></div>

            {isUnlocking && (
              <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
                <span className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-items-center mt-6">
            {/* Glass Card */}
            <div className="w-full max-w-sm bg-gray-900/40 backdrop-blur-md border border-gray-800/60 p-8 rounded-3xl flex flex-col items-center gap-6 shadow-xl relative group hover:border-amber-500/20 transition-all duration-300">
              <div className="absolute top-4 left-4 bg-gray-950/80 px-3 py-1 rounded-lg border border-gray-800/80 text-xs font-semibold text-gray-400">
                MEDIDOR DE VOLUMEN
              </div>

              {customer_id && (
                <div className="absolute top-4 right-4 bg-purple-500/10 border border-purple-500/30 px-3 py-1 rounded-lg text-xs font-semibold text-purple-300 flex items-center gap-1.5 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                  <span>👤</span>
                  {customer_id}
                </div>
              )}

              <div className="mt-4">
                <BeerGlass mlTotal={ml_total} />
              </div>

              <div className="text-3xl font-black tracking-tight text-white flex items-baseline gap-1 mt-2">
                <span>{ml_total.toFixed(0)}</span>
                <span className="text-lg text-gray-500 font-normal">ml</span>
              </div>
            </div>

            {/* Price Card */}
            <div className="w-full max-w-sm bg-gray-900/40 backdrop-blur-md border border-gray-800/60 p-8 rounded-3xl flex flex-col items-center justify-center gap-6 shadow-xl min-h-[350px] relative hover:border-purple-500/20 transition-all duration-300">
              <div className="absolute top-4 left-4 bg-gray-950/80 px-3 py-1 rounded-lg border border-gray-800/80 text-xs font-semibold text-gray-400">
                PRECIO DE SESIÓN
              </div>

              <span className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-6">Total a Pagar</span>
              <PriceCounter value={price_current} />

              <AnimatePresence>
                {status === 'closed' && ml_total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    className="mt-6 px-6 py-3 bg-emerald-500 text-gray-950 text-sm font-bold rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.3)] flex items-center gap-2 border border-emerald-400/20"
                  >
                    <span>💸</span>
                    <span>¡Sesión Finalizada! Cobrando...</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {status === 'open' && (
                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl animate-pulse">
                  <span>⚡</span>
                  <span>VERTIDO ACTIVO</span>
                </div>
              )}
            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
}
