import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ContabiliumClient } from "./client";
import { ContabiliumAuthError, ContabiliumRateLimitError } from "./types";

const BASE_URL = "http://test-contabilium.local/v1";

const server = setupServer(
  http.post(`${BASE_URL}/ObtenerToken`, () =>
    HttpResponse.json({
      access_token: "test-bearer-token",
      expires_in: 3600,
      token_type: "Bearer",
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new ContabiliumClient({ apiKey: "test-api-key", baseUrl: BASE_URL });
}

describe("ContabiliumClient", () => {
  it("fetches token on first request and returns normalized comprobantes", async () => {
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () =>
        HttpResponse.json({
          data: [
            {
              id: 1,
              numero: "FA-0001",
              fecha_vencimiento: "30/06/2026",
              importe_total: 1000,
              saldo: 1000,
            },
          ],
          total: 1,
          per_page: 100,
        })
      )
    );

    const client = makeClient();
    const result = await client.getComprobantesVenta({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].fecha_vencimiento).toBe("30/06/2026");
  });

  it("paginates through multiple pages and concatenates results", async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, ({ request }) => {
        callCount++;
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? "1");
        if (page === 1) {
          return HttpResponse.json({ data: [{ id: 1 }], total: 2, per_page: 1 });
        }
        return HttpResponse.json({ data: [{ id: 2 }], total: 2, per_page: 1 });
      })
    );

    const client = makeClient();
    const result = await client.getComprobantesVenta({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
    expect(result).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  it("re-authenticates and retries on 401, succeeds on second attempt", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () => {
        calls++;
        if (calls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ data: [{ id: 99 }], total: 1, per_page: 100 });
      })
    );

    const client = makeClient();
    const result = await client.getComprobantesVenta({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
    expect(result).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("throws ContabiliumAuthError on 401 in second attempt", async () => {
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () =>
        new HttpResponse(null, { status: 401 })
      )
    );

    const client = makeClient();
    await expect(
      client.getComprobantesVenta({ desde: "2026-01-01", hasta: "2026-12-31" })
    ).rejects.toThrow(ContabiliumAuthError);
  });

  it("throws ContabiliumRateLimitError with Retry-After header value", async () => {
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () =>
        new HttpResponse(null, {
          status: 429,
          headers: { "Retry-After": "45" },
        })
      )
    );

    const client = makeClient();
    const err = await client
      .getComprobantesVenta({ desde: "2026-01-01", hasta: "2026-12-31" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ContabiliumRateLimitError);
    expect(err.retryAfterSeconds).toBe(45);
  });

  it("throws ContabiliumRateLimitError with 60s fallback when no Retry-After", async () => {
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () =>
        new HttpResponse(null, { status: 429 })
      )
    );

    const client = makeClient();
    const err = await client
      .getComprobantesVenta({ desde: "2026-01-01", hasta: "2026-12-31" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ContabiliumRateLimitError);
    expect(err.retryAfterSeconds).toBe(60);
  });

  it("fetches token when none is cached yet (fresh client)", async () => {
    let tokenCalls = 0;
    server.use(
      http.post(`${BASE_URL}/ObtenerToken`, () => {
        tokenCalls++;
        return HttpResponse.json({
          access_token: "fresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }),
      http.get(`${BASE_URL}/cobros`, () =>
        HttpResponse.json({ data: [{ id: 7 }], total: 1, per_page: 100 })
      )
    );

    const client = makeClient();
    await client.getCobros({ desde: "2026-01-01", hasta: "2026-12-31" });
    expect(tokenCalls).toBe(1);
  });
});
