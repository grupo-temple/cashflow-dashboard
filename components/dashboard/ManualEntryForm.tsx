"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: string;
  canCreate: boolean;
}

export function ManualEntryForm({ companyId, canCreate }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<"cobro" | "pago">("cobro");
  const [fecha, setFecha] = useState("");
  const [importe, setImporte] = useState("");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [descripcion, setDescripcion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/manual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        tipo,
        fechaEsperada: fecha,
        importe: Number(importe),
        moneda,
        descripcion,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al guardar");
    } else {
      setOpen(false);
      setFecha("");
      setImporte("");
      setDescripcion("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Agregar ajuste manual
        </button>
      ) : (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-purple-800 mb-3">
            Nuevo ajuste manual
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="cobro">Cobro esperado</option>
                <option value="pago">Pago comprometido</option>
              </select>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as typeof moneda)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <input
                type="number"
                required
                min={0.01}
                step={0.01}
                placeholder="Importe"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <input
              type="text"
              required
              placeholder="Descripción (ej: Préstamo banco X)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-gray-500 text-sm hover:text-gray-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
