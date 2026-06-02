export interface TopCustomer {
  username: string;
  total_ml: number;
  total_eur: number;
}

export interface BeerStylePopularity {
  beer_style: string;
  total_ml: number;
  total_eur: number;
}

export interface RecentConsumption {
  username: string;
  tap_id: string;
  beer_style: string;
  ml_served: number;
  total_amount: number;
  date: string;
}

export interface MetricsResponse {
  top_customers: TopCustomer[];
  beer_styles: BeerStylePopularity[];
  recent: RecentConsumption[];
}
