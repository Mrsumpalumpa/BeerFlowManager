import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface AuthState {
  token: string | null;
  role: string | null;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    role: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    const storedToken = localStorage.getItem('beerflow_token');
    if (storedToken) {
      try {
        const decoded: any = jwtDecode(storedToken);
        const isExpired = decoded.exp * 1000 < Date.now();
        if (!isExpired) {
          setAuthState({
            token: storedToken,
            role: decoded.role,
            isAuthenticated: true,
          });
        } else {
          localStorage.removeItem('beerflow_token');
        }
      } catch (e) {
        localStorage.removeItem('beerflow_token');
      }
    }
  }, []);

  const login = (token: string) => {
    localStorage.setItem('beerflow_token', token);
    const decoded: any = jwtDecode(token);
    setAuthState({
      token,
      role: decoded.role,
      isAuthenticated: true,
    });
  };

  const logout = () => {
    localStorage.removeItem('beerflow_token');
    setAuthState({ token: null, role: null, isAuthenticated: false });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
