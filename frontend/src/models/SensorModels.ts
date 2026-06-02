export interface UnlockResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface PulseResponse {
  ok: boolean;
  ml_total?: number;
  price?: number;
  error?: string;
}
