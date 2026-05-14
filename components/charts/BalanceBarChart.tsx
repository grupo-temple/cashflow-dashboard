"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface BalanceDataPoint {
  label: string;
  cobros: number;
  pagos: number;
}

interface Props {
  data: BalanceDataPoint[];
  companyColor?: string;
}

const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function BalanceBarChart({ data, companyColor = "#3B82F6" }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Sin movimientos en el período seleccionado.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v) =>
            v >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
              ? `$${(v / 1_000).toFixed(0)}K`
              : `$${v}`
          }
        />
        <Tooltip
          formatter={(value) => ARS.format(Number(value))}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend />
        <Bar dataKey="cobros" name="Cobros" fill={companyColor} radius={[3, 3, 0, 0]} />
        <Bar dataKey="pagos" name="Pagos" fill="#F87171" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
