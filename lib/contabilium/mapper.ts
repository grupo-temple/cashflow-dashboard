import { randomUUID } from "crypto";
import type { NewComprobante, NewMovimiento } from "@/lib/db/schema";
import type {
  ContabiliumComprobanteRaw,
  ContabiliumMovimientoRaw,
} from "./types";

/** Parse Argentine date format DD/MM/YYYY → ISO string YYYY-MM-DD */
function parseArgDate(raw?: string): string | null {
  if (!raw) return null;
  const parts = raw.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function normalizeMoneda(raw?: string): "ARS" | "USD" {
  if (!raw) return "ARS";
  return raw.toUpperCase() === "USD" ? "USD" : "ARS";
}

export function mapComprobante(
  raw: ContabiliumComprobanteRaw,
  companyId: string,
  tipo: "venta" | "compra",
  groupCuits: string[]
): NewComprobante {
  const cuit = raw.cuit?.trim() ?? null;
  const isIntercompany = cuit ? groupCuits.includes(cuit) : false;

  return {
    id: randomUUID(),
    companyId,
    tipo,
    numero: raw.numero ?? null,
    cuitContraparte: cuit,
    razonSocialContraparte: raw.razon_social ?? null,
    fechaEmision: parseArgDate(raw.fecha_emision),
    fechaVencimiento: parseArgDate(raw.fecha_vencimiento),
    importeTotal: raw.importe_total ?? 0,
    saldoPendiente: raw.saldo ?? 0,
    moneda: normalizeMoneda(raw.moneda),
    isIntercompany,
    contabiliumId: String(raw.id),
  };
}

export function mapMovimiento(
  raw: ContabiliumMovimientoRaw,
  companyId: string
): NewMovimiento {
  const tipoRaw = raw.tipo?.toLowerCase() ?? "";
  const tipo: "cobro" | "pago" = tipoRaw === "pago" ? "pago" : "cobro";

  return {
    id: randomUUID(),
    companyId,
    tipo,
    fecha: parseArgDate(raw.fecha) ?? new Date().toISOString().split("T")[0],
    importe: raw.importe ?? 0,
    moneda: normalizeMoneda(raw.moneda),
    comprobanteId: raw.comprobante_id ? String(raw.comprobante_id) : null,
    descripcion: raw.descripcion ?? null,
    contabiliumId: String(raw.id),
  };
}
