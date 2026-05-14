// Raw shapes returned by the Contabilium API (field names TBD — verified against
// the actual Postman collection during implementation per deferred question in plan)

export interface ContabiliumTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

export interface ContabiliumComprobanteRaw {
  id: number;
  numero?: string;
  tipo?: string;
  /** CUIT of the counterparty */
  cuit?: string;
  razon_social?: string;
  fecha_emision?: string; // DD/MM/YYYY
  fecha_vencimiento?: string; // DD/MM/YYYY
  importe_total?: number;
  saldo?: number;
  moneda?: string;
}

export interface ContabiliumMovimientoRaw {
  id: number;
  tipo?: string; // cobro | pago
  fecha?: string; // DD/MM/YYYY
  importe?: number;
  moneda?: string;
  comprobante_id?: number;
  descripcion?: string;
}

export interface ContabiliumPaginatedResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  per_page?: number;
}

export interface ContabiliumClientConfig {
  apiKey: string;
  empresaSelectorValue?: string; // for multi-empresa account
  baseUrl?: string;
}

export class ContabiliumAuthError extends Error {
  constructor(message = "Contabilium authentication failed after retry") {
    super(message);
    this.name = "ContabiliumAuthError";
  }
}

export class ContabiliumRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds}s`);
    this.name = "ContabiliumRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
