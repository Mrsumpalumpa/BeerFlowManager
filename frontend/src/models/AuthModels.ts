export interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'CUSTOMER';
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
}

export interface GenericAuthResponse {
  ok: boolean;
  message?: string;
  error?: string;
}
