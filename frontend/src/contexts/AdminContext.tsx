import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import type { StockStatus, Keg } from '../models/TapModels';
import type { User } from '../models/AuthModels';

interface AdminContextType {
  taps: StockStatus[];
  kegs: Keg[];
  users: User[];
  alerts: string[];
  replaceKeg: (tapId: string) => Promise<void>;
  fetchStock: () => Promise<void>;
  fetchKegs: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  createKeg: (keg: { name: string; beer_style?: string; capacity_ml: number }) => Promise<void>;
  createTap: (tap: { tap_code: string; name?: string; price_per_ml: number; keg_id?: string }) => Promise<void>;
  updateTap: (tapId: string, updates: { name?: string; price_per_ml?: number; keg_id?: string; is_active?: boolean }) => Promise<void>;
  deleteTap: (tapId: string) => Promise<void>;
  deleteKeg: (kegId: string) => Promise<void>;
  createUser: (user: { username: string; password?: string; role?: string }) => Promise<User>;
  updateUser: (userId: number, updates: { password?: string; role?: string }) => Promise<void>;
  deleteUser: (userId: number) => Promise<void>;
  generateQrToken: (userId: number) => Promise<string>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { token, isAuthenticated, role } = useAuth();
  const queryClient = useQueryClient();
  const [alerts, setAlerts] = useState<string[]>([]);
  
  const WS_URL = import.meta.env.VITE_TAP_MANAGEMENT_WS_URL || 'ws://localhost:8002/ws/admin';
  const API_URL = import.meta.env.VITE_TAP_MANAGEMENT_URL || 'http://localhost:8002';
  const BILLING_URL = import.meta.env.VITE_BILLING_URL || 'http://localhost:8001';

  const isEnabled = !!(isAuthenticated && role === 'ADMIN' && token);


  // 1. Queries
  const tapsQuery = useQuery({
    queryKey: ['adminTapsStock'],
    queryFn: async (): Promise<StockStatus[]> => {
      const res = await fetch(`${API_URL}/admin/taps/stock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar inventario de grifos');
      return res.json();
    },
    enabled: isEnabled,
  });

  const kegsQuery = useQuery({
    queryKey: ['adminKegs'],
    queryFn: async (): Promise<Keg[]> => {
      const res = await fetch(`${API_URL}/admin/kegs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar depósitos de barriles');
      return res.json();
    },
    enabled: isEnabled,
  });

  const usersQuery = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async (): Promise<User[]> => {
      const res = await fetch(`${BILLING_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar usuarios');
      return res.json();
    },
    enabled: isEnabled,
  });

  // Helper getters to keep compatibility
  const taps = tapsQuery.data || [];
  const kegs = kegsQuery.data || [];
  const users = usersQuery.data || [];


  const fetchStock = async () => {
    await tapsQuery.refetch();
  };

  const fetchKegs = async () => {
    await kegsQuery.refetch();
  };

  const fetchUsers = async () => {
    await usersQuery.refetch();
  };


  // 2. Mutations
  const replaceKegMutation = useMutation({
    mutationFn: async (tapId: string) => {
      const res = await fetch(`${API_URL}/admin/taps/${tapId}/kegs/replace`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al reemplazar el barril');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTapsStock'] });
      queryClient.invalidateQueries({ queryKey: ['adminKegs'] });
    }
  });

  const createKegMutation = useMutation({
    mutationFn: async (keg: { name: string; beer_style?: string; capacity_ml: number }) => {
      const res = await fetch(`${API_URL}/admin/kegs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(keg)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error al crear barril');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminKegs'] });
    }
  });

  const createTapMutation = useMutation({
    mutationFn: async (tap: { tap_code: string; name?: string; price_per_ml: number; keg_id?: string }) => {
      const res = await fetch(`${API_URL}/admin/taps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(tap)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error al crear grifo');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTapsStock'] });
      queryClient.invalidateQueries({ queryKey: ['publicTaps'] });
    }
  });

  const updateTapMutation = useMutation({
    mutationFn: async ({ tapId, updates }: { tapId: string; updates: { name?: string; price_per_ml?: number; keg_id?: string; is_active?: boolean } }) => {
      const res = await fetch(`${API_URL}/admin/taps/${tapId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error al actualizar grifo');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTapsStock'] });
      queryClient.invalidateQueries({ queryKey: ['publicTaps'] });
    }
  });

  const replaceKeg = async (tapId: string) => {
    await replaceKegMutation.mutateAsync(tapId);
  };

  const createKeg = async (keg: { name: string; beer_style?: string; capacity_ml: number }) => {
    await createKegMutation.mutateAsync(keg);
  };

  const createTap = async (tap: { tap_code: string; name?: string; price_per_ml: number; keg_id?: string }) => {
    await createTapMutation.mutateAsync(tap);
  };

  const updateTap = async (tapId: string, updates: { name?: string; price_per_ml?: number; keg_id?: string; is_active?: boolean }) => {
    await updateTapMutation.mutateAsync({ tapId, updates });
  };

  const deleteTapMutation = useMutation({
    mutationFn: async (tapId: string) => {
      const res = await fetch(`${API_URL}/admin/taps/${tapId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al eliminar grifo');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTapsStock'] });
      queryClient.invalidateQueries({ queryKey: ['publicTaps'] });
    }
  });

  const deleteKegMutation = useMutation({
    mutationFn: async (kegId: string) => {
      const res = await fetch(`${API_URL}/admin/kegs/${kegId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al eliminar barril');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminKegs'] });
      queryClient.invalidateQueries({ queryKey: ['adminTapsStock'] });
      queryClient.invalidateQueries({ queryKey: ['publicTaps'] });
    }
  });

  const deleteTap = async (tapId: string) => {
    await deleteTapMutation.mutateAsync(tapId);
  };

  const deleteKeg = async (kegId: string) => {
    await deleteKegMutation.mutateAsync(kegId);
  };

  const createUser = async (user: { username: string; password?: string; role?: string }) => {
    const res = await fetch(`${BILLING_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(user)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Error al crear usuario');
    }
    const newUser = await res.json();
    queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    return newUser;
  };

  const updateUser = async (userId: number, updates: { password?: string; role?: string }) => {
    const res = await fetch(`${BILLING_URL}/auth/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Error al actualizar usuario');
    }
    queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
  };

  const deleteUser = async (userId: number) => {
    const res = await fetch(`${BILLING_URL}/auth/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al eliminar usuario');
    queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
  };

  const generateQrToken = async (userId: number) => {
    const res = await fetch(`${BILLING_URL}/auth/users/${userId}/qr-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al generar token QR');
    const data = await res.json();
    return data.access_token;
  };


  // 3. Real-time updates via WebSockets synced with TanStack Query Cache
  useEffect(() => {
    if (isEnabled) {
      const ws = new WebSocket(WS_URL);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const alertMsg = data.type === 'EMPTY' 
            ? `¡ALERTA! El grifo ${data.tap_id} se ha vaciado.`
            : `Aviso: Stock bajo en ${data.tap_id} (${data.current_volume_ml} ml restantes)`;
          
          setAlerts(prev => [...prev, alertMsg]);
          
          // Sincronizar stock directamente en el caché de TanStack Query
          queryClient.setQueryData<StockStatus[]>(['adminTapsStock'], (oldTaps) => {
            if (!oldTaps) return oldTaps;
            return oldTaps.map(tap => {
               if (tap.tap_id === data.tap_id) {
                   const percentage = (data.current_volume_ml / 25000) * 100;
                   return { 
                     ...tap, 
                     current_volume_ml: data.current_volume_ml, 
                     percentage_left: percentage, 
                     is_low_stock: percentage <= 10 
                   };
               }
               return tap;
            });
          });
        } catch(e) {
          console.error('WS Error:', e);
        }
      };

      return () => ws.close();
    }
  }, [isEnabled, WS_URL, queryClient]);

  return (
    <AdminContext.Provider value={{ 
        taps, kegs, users, alerts, 
        replaceKeg, fetchStock, fetchKegs, fetchUsers, 
        createKeg, createTap, updateTap, deleteTap, deleteKeg,
        createUser, updateUser, deleteUser, generateQrToken
      }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used within an AdminProvider');
  return context;
};
