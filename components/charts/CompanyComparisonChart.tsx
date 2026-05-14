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
  Cell,
} from "recharts";

interface CompanyBar {
  name: string;
  saldoActual: number;
  cobros: number;
  pagos: number;
  color: string;
}

interface Props {
  data: CompanyBar[];
}

const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function CompanyComparisonChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Sin datos para comparar.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v) =>
            v >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : `$${(v / 1_000).toFixed(0)}K`
          }
        />
        <Tooltip formatter={(value) => ARS.format(Number(value))} />
        <Legend />
        <Bar dataKey="saldoActual" name="Saldo Actual">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
        <Bar dataKey="cobros" name="Cobros" fill="#34D399" />
        <Bar dataKey="pagos" name="Pagos" fill="#F87171" />
      </BarChart>
    </ResponsiveContainer>
  );
}
