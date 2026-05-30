import { useState, useEffect, useRef } from 'react';

export interface TapState {
  tap_id: string;
  ml_total: number;
  price_current: number;
  status: 'idle' | 'open' | 'closed';
  last_pulse_at: number | null;
  customer_id: string | null;
}

const IDLE_STATE = (tapId: string): TapState => ({
  tap_id: tapId,
  ml_total: 0,
  price_current: 0,
  status: 'idle',
  last_pulse_at: null,
  customer_id: null,
});

export function useBeerWebSocket(tapId: string) {
  const [tapState, setTapState] = useState<TapState>(IDLE_STATE(tapId));
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Guardar el último estado activo para no parpadear al recibir idle
  const lastActiveState = useRef<TapState | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WS_URL = import.meta.env.VITE_BEERFLOW_WS_URL || 'ws://localhost:8000';

  useEffect(() => {
    // Al cambiar de grifo, reseteamos el estado visible y la referencia al estado anterior
    setTapState(IDLE_STATE(tapId));
    lastActiveState.current = null;

    let alive = true;

    const connect = () => {
      if (!alive) return;

      const ws = new WebSocket(`${WS_URL}/ws/${tapId}`);

      ws.onopen = () => {
        if (!alive) { ws.close(); return; }
        setIsConnected(true);
      };

      ws.onclose = () => {
        if (!alive) return;
        setIsConnected(false);
        // Reconectar tras 2 segundos, pero NO resetear el estado visible
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        if (!alive) return;
        try {
          const incoming: TapState = JSON.parse(event.data);

          setTapState(prev => {
            // Si el mensaje es "idle" (ml=0) pero tenemos un estado activo o cerrado
            // con datos reales, ignorar el reset hasta que arranque una nueva sesión.
            if (
              incoming.status === 'idle' &&
              incoming.ml_total === 0 &&
              (prev.status === 'open' || prev.status === 'closed') &&
              prev.ml_total > 0
            ) {
              // Mantener el último estado visible. Sólo reseteamos si el usuario
              // cierra la sesión manualmente o si pasa suficiente tiempo.
              return prev;
            }

            // Si llega un estado activo (open), guardarlo como referencia
            if (incoming.status === 'open' || incoming.ml_total > 0) {
              lastActiveState.current = incoming;
            }

            // Si el status pasa de "closed" a "idle" con valores a 0 → nueva sesión,
            // pero solo lo aceptamos si el lastPulseAt cambia (nueva orden).
            if (
              prev.status === 'closed' &&
              incoming.status === 'idle'
            ) {
              // Limpiar referencia y aceptar el reset
              lastActiveState.current = null;
              return incoming;
            }

            return incoming;
          });
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [tapId, WS_URL]);

  return { ...tapState, isConnected };
}
