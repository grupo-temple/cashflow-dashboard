"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ExchangeRateWidgetProps {
  companyId: string;
  companyName: string;
  currentRate: number | null;
  currentFecha: string | null;
  canEdit: boolean;
}

export function ExchangeRateWidget({
  companyId,
  companyName,
  currentRate,
  currentFecha,
  canEdit,
}: ExchangeRateWidgetProps) {
  const router = useRouter();
  const [rate, setRate] = useState("");
  const [tipo, setTipo] = useState<"oficial" | "mep" | "ccl">("oficial");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/exchange-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        tipo,
        valorArsPorUsd: Number(rate),
        fechaVigencia: new Date().toISOString().split("T")[0],
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al guardar");
    } else {
      setRate("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{companyName}</h3>
      <p className="text-xs text-gray-400 mb-4">
        {currentRate
          ? `TC: $${currentRate.toLocaleString("es-AR")} ARS/USD — ${currentFecha}`
          : "Sin tipo de cambio cargado"}
      </p>

      {!canEdit && (
        <p className="text-xs text-gray-400 italic">
          Solo administradores pueden actualizar el tipo de cambio.
        </p>
      )}

      {canEdit && (
        <form onSubmit={handleSave} className="space-y-3">
          <div className="flex gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="oficial">Oficial</option>
              <option value="mep">MEP</option>
              <option value="ccl">CCL</option>
            </select>
            <input
              type="number"
              required
              min={1}
              step={0.01}
              placeholder="ARS por USD"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={loading || !rate}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "…" : "Guardar"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
