export interface Tap {
  tap_code: string;
  name: string;
  is_blocked: boolean;
  keg_id: string | null;
  active_keg: string | null;
  percentage_left: number;
}

export interface StockStatus {
  tap_id: string;
  name: string;
  keg_id: string | null;
  current_volume_ml: number;
  percentage_left: number;
  is_low_stock: boolean;
}

export interface Keg {
  id: string;
  name: string;
  beer_style: string | null;
  capacity_ml: number;
  remaining_ml: number;
  created_at?: string;
  updated_at?: string;
}

export interface GenericMessageResponse {
  message: string;
}
