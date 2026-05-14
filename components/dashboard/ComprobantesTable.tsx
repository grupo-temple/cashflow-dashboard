import type { ComprobanteRow } from "@/lib/db/queries/movements";
import { formatDualCurrency } from "@/lib/db/queries/exchange_rates";

interface Props {
  comprobantes: ComprobanteRow[];
  tipo: "venta" | "compra";
  usdRate: number | null;
}

const ARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ComprobantesTable({ comprobantes, tipo, usdRate }: Props) {
  if (comprobantes.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        Sin {tipo === "venta" ? "cuentas a cobrar" : "cuentas a pagar"} abiertas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="pb-2 font-medium text-gray-500 w-8"></th>
            <th className="pb-2 font-medium text-gray-500">Contraparte</th>
            <th className="pb-2 font-medium text-gray-500">Número</th>
            <th className="pb-2 font-medium text-gray-500">Vencimiento</th>
            <th className="pb-2 font-medium text-gray-500 text-right">Saldo ARS</th>
            {usdRate && (
              <th className="pb-2 font-medium text-gray-500 text-right">USD</th>
            )}
          </tr>
        </thead>
        <tbody>
          {comprobantes.map((c) => {
            const { usd } = formatDualCurrency(c.saldoPendiente, usdRate);
            const isOverdue =
              c.fechaVencimiento &&
              c.fechaVencimiento < new Date().toISOString().split("T")[0];

            return (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 pr-2">
                  {c.isIntercompany && (
                    <span
                      title="Intercompany"
                      className="inline-block w-2 h-2 rounded-full bg-purple-400"
                    />
                  )}
                </td>
                <td className="py-2 text-gray-700">
                  {c.razonSocialContraparte ?? "—"}
                </td>
                <td className="py-2 text-gray-500">{c.numero ?? "—"}</td>
                <td className={`py-2 ${isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {c.fechaVencimiento
                    ? new Date(c.fechaVencimiento + "T00:00:00").toLocaleDateString("es-AR")
                    : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {ARS.format(c.saldoPendiente)}
                </td>
                {usdRate && (
                  <td className="py-2 text-right tabular-nums text-gray-400">
                    {usd !== null ? USD.format(usd) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
