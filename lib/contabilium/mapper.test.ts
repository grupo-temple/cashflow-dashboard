import { describe, it, expect } from "vitest";
import { mapComprobante, mapMovimiento } from "./mapper";
import type { ContabiliumComprobanteRaw, ContabiliumMovimientoRaw } from "./types";

const GROUP_CUITS = ["20111111111", "20222222222", "20333333333"];
const COMPANY_ID = "company-a";

describe("mapComprobante", () => {
  it("normalizes fecha_vencimiento from DD/MM/YYYY to ISO", () => {
    const raw: ContabiliumComprobanteRaw = {
      id: 1,
      fecha_vencimiento: "31/05/2026",
      importe_total: 100,
      saldo: 100,
    };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.fechaVencimiento).toBe("2026-05-31");
  });

  it("marks is_intercompany = true when CUIT matches a group company", () => {
    const raw: ContabiliumComprobanteRaw = {
      id: 2,
      cuit: "20111111111",
      importe_total: 500,
      saldo: 500,
    };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.isIntercompany).toBe(true);
  });

  it("marks is_intercompany = false for external CUITs", () => {
    const raw: ContabiliumComprobanteRaw = {
      id: 3,
      cuit: "20999999999",
      importe_total: 200,
      saldo: 100,
    };
    const result = mapComprobante(raw, COMPANY_ID, "compra", GROUP_CUITS);
    expect(result.isIntercompany).toBe(false);
  });

  it("handles missing fecha_vencimiento without throwing", () => {
    const raw: ContabiliumComprobanteRaw = { id: 4, importe_total: 50, saldo: 50 };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.fechaVencimiento).toBeNull();
  });

  it("sets contabiliumId from raw.id as string", () => {
    const raw: ContabiliumComprobanteRaw = { id: 99, importe_total: 1, saldo: 1 };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.contabiliumId).toBe("99");
  });

  it("normalizes moneda to USD when raw says USD", () => {
    const raw: ContabiliumComprobanteRaw = {
      id: 5,
      moneda: "usd",
      importe_total: 1000,
      saldo: 1000,
    };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.moneda).toBe("USD");
  });

  it("defaults moneda to ARS when missing", () => {
    const raw: ContabiliumComprobanteRaw = { id: 6, importe_total: 1, saldo: 1 };
    const result = mapComprobante(raw, COMPANY_ID, "venta", GROUP_CUITS);
    expect(result.moneda).toBe("ARS");
  });
});

describe("mapMovimiento", () => {
  it("maps cobro type correctly", () => {
    const raw: ContabiliumMovimientoRaw = {
      id: 10,
      tipo: "cobro",
      fecha: "15/04/2026",
      importe: 300,
    };
    const result = mapMovimiento(raw, COMPANY_ID);
    expect(result.tipo).toBe("cobro");
    expect(result.fecha).toBe("2026-04-15");
    expect(result.importe).toBe(300);
  });

  it("maps pago type correctly", () => {
    const raw: ContabiliumMovimientoRaw = {
      id: 11,
      tipo: "pago",
      fecha: "01/01/2026",
      importe: 150,
    };
    const result = mapMovimiento(raw, COMPANY_ID);
    expect(result.tipo).toBe("pago");
  });

  it("defaults to cobro for unknown tipo", () => {
    const raw: ContabiliumMovimientoRaw = { id: 12, tipo: "unknown", importe: 1 };
    const result = mapMovimiento(raw, COMPANY_ID);
    expect(result.tipo).toBe("cobro");
  });
});
