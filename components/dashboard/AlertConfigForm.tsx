"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: string;
  companyName: string;
  existingSaldoBajo: { umbral?: number | null; diasAnticipacion?: number | null; activo?: boolean } | null;
  existingFacturaVencida: { umbral?: number | null; activo?: boolean } | null;
}

export function AlertConfigForm({
  companyId,
  companyName,
  existingSaldoBajo,
  existingFacturaVencida,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function upsert(tipo: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_config", companyId, tipo, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
      } else {
        setSuccess(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <h3 className="text-sm font-semibold text-gray-800">{companyName}</h3>

      {/* Saldo Bajo */}
      <SaldoBajoConfig
        initial={existingSaldoBajo}
        onSave={(data) => upsert("saldo_bajo", data)}
        saving={saving}
      />

      {/* Factura Vencida */}
      <FacturaVencidaConfig
        initial={existingFacturaVencida}
        onSave={(data) => upsert("factura_vencida", data)}
        saving={saving}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-700">Guardado</p>}
    </div>
  );
}

function SaldoBajoConfig({
  initial,
  onSave,
  saving,
}: {
  initial: Props["existingSaldoBajo"];
  onSave: (d: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [activo, setActivo] = useState(initial?.activo ?? false);
  const [umbral, setUmbral] = useState(String(initial?.umbral ?? "0"));
  const [dias, setDias] = useState(String(initial?.diasAnticipacion ?? "30"));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Alerta de Saldo Bajo</span>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Activa
        </label>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500">Umbral (ARS)</label>
          <input
            type="number"
            value={umbral}
            onChange={(e) => setUmbral(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm mt-0.5"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">Anticipación (días)</label>
          <input
            type="number"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm mt-0.5"
          />
        </div>
      </div>
      <button
        disabled={saving}
        onClick={() =>
          onSave({ umbral: Number(umbral), diasAnticipacion: Number(dias), activo })
        }
        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

function FacturaVencidaConfig({
  initial,
  onSave,
  saving,
}: {
  initial: Props["existingFacturaVencida"];
  onSave: (d: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [activo, setActivo] = useState(initial?.activo ?? false);
  const [umbral, setUmbral] = useState(String(initial?.umbral ?? "7"));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Alerta de Facturas Vencidas</span>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Activa
        </label>
      </div>
      <div>
        <label className="text-xs text-gray-500">Días sin cobrar</label>
        <input
          type="number"
          value={umbral}
          onChange={(e) => setUmbral(e.target.value)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <button
        disabled={saving}
        onClick={() => onSave({ umbral: Number(umbral), activo })}
        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
