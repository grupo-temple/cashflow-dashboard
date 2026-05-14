import {
  ContabiliumClientConfig,
  ContabiliumTokenResponse,
  ContabiliumComprobanteRaw,
  ContabiliumMovimientoRaw,
  ContabiliumPaginatedResponse,
  ContabiliumAuthError,
  ContabiliumRateLimitError,
} from "./types";

const DEFAULT_BASE_URL = "https://api.contabilium.com/v1";

interface DateRangeParams {
  desde: string; // ISO date YYYY-MM-DD
  hasta: string;
}

interface PagedParams extends DateRangeParams {
  page?: number;
}

export class ContabiliumClient {
  private apiKey: string;
  private empresaSelectorValue?: string;
  private baseUrl: string;
  private bearerToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: ContabiliumClientConfig) {
    this.apiKey = config.apiKey;
    this.empresaSelectorValue = config.empresaSelectorValue;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  // ── Token management ────────────────────────────────────────────────────────

  private isTokenValid(): boolean {
    return (
      !!this.bearerToken &&
      !!this.tokenExpiresAt &&
      this.tokenExpiresAt > new Date()
    );
  }

  async obtenerToken(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/ObtenerToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey }),
    });
    if (!res.ok) {
      throw new ContabiliumAuthError(
        `ObtenerToken failed with status ${res.status}`
      );
    }
    const data = (await res.json()) as ContabiliumTokenResponse;
    this.bearerToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000 - 30_000);
  }

  // ── HTTP helper ─────────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.bearerToken}`,
      "Content-Type": "application/json",
    };
    if (this.empresaSelectorValue) {
      // Exact header/param name TBD against real API (deferred per plan)
      headers["X-Empresa-Id"] = this.empresaSelectorValue;
    }
    return headers;
  }

  private async fetchWithAuth(
    url: string,
    isRetry = false
  ): Promise<Response> {
    if (!this.isTokenValid()) {
      await this.obtenerToken();
    }

    const res = await fetch(url, { headers: this.buildHeaders() });

    if (res.status === 401) {
      if (isRetry) throw new ContabiliumAuthError();
      await this.obtenerToken();
      return this.fetchWithAuth(url, true);
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
      throw new ContabiliumRateLimitError(waitSeconds);
    }

    if (res.status >= 500) {
      throw new Error(`Contabilium server error: ${res.status}`);
    }

    return res;
  }

  // ── Paginated fetch helper ──────────────────────────────────────────────────

  private async fetchAllPages<T>(
    endpoint: string,
    params: DateRangeParams
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;

    while (true) {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      url.searchParams.set("desde", params.desde);
      url.searchParams.set("hasta", params.hasta);
      url.searchParams.set("page", String(page));

      const res = await this.fetchWithAuth(url.toString());
      const body = (await res.json()) as ContabiliumPaginatedResponse<T>;

      const items = body.data ?? [];
      results.push(...items);

      const totalPages = body.total && body.per_page
        ? Math.ceil(body.total / body.per_page)
        : 1;

      if (page >= totalPages || items.length === 0) break;
      page++;
    }

    return results;
  }

  // ── Public API methods ──────────────────────────────────────────────────────

  async getComprobantesVenta(
    params: PagedParams
  ): Promise<ContabiliumComprobanteRaw[]> {
    return this.fetchAllPages<ContabiliumComprobanteRaw>(
      "/comprobantes/venta",
      params
    );
  }

  async getComprobantesCompra(
    params: PagedParams
  ): Promise<ContabiliumComprobanteRaw[]> {
    return this.fetchAllPages<ContabiliumComprobanteRaw>(
      "/comprobantes/compra",
      params
    );
  }

  async getCobros(params: DateRangeParams): Promise<ContabiliumMovimientoRaw[]> {
    return this.fetchAllPages<ContabiliumMovimientoRaw>("/cobros", params);
  }

  async getPagos(params: DateRangeParams): Promise<ContabiliumMovimientoRaw[]> {
    return this.fetchAllPages<ContabiliumMovimientoRaw>("/pagos", params);
  }
}
