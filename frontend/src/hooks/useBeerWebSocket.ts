/**
 * useBeerWebSocket — Hook para conectarse al beerflow-service en tiempo real
 *
 * Uso:
 *   const { ml, price, status, isConnected } = useBeerWebSocket('tap-001')
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type TapStatus = 'idle' | 'open' | 'closed'

export interface TapState {
  tap_id: string
  ml_total: number
  price_current: number
  status: TapStatus
  last_pulse_at: number | null
  customer_id: string | null
}

interface UseBeerWebSocketReturn extends TapState {
  isConnected: boolean
  error: string | null
}

const WS_BASE_URL =
  import.meta.env.VITE_BEERFLOW_WS_URL ?? 'ws://localhost:8000'

const INITIAL_STATE: TapState = {
  tap_id: '',
  ml_total: 0,
  price_current: 0,
  status: 'idle',
  last_pulse_at: null,
  customer_id: null,
}

export function useBeerWebSocket(tapId: string): UseBeerWebSocketReturn {
  const [state, setState] = useState<TapState>({ ...INITIAL_STATE, tap_id: tapId })
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE_URL}/ws/${tapId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const data: TapState = JSON.parse(event.data)
        setState(data)
      } catch {
        console.warn('[useBeerWebSocket] Error parsing message', event.data)
      }
    }

    ws.onerror = () => {
      setError('Error de conexión con el grifo')
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Reconectar automáticamente tras 2 segundos
      reconnectTimer.current = setTimeout(connect, 2000)
    }
  }, [tapId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { ...state, isConnected, error }
}
