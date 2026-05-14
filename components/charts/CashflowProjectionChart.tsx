"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DayProjection {
  fecha: string;
  saldoProyectado: number;
  cobrosDelDia: number;
  pagosDelDia: number;
  tieneManualEntry: boolean;
}

interface Props {
  data: DayProjection[];
  horizonte: 30 | 60 | 90;
  umbralAlerta?: number;
  companyColor?: string;
}

const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function CustomDot(props: { cx?: number; cy?: number; payload?: DayProjection }) {
  const { cx, cy, payload } = props;
  if (!payload?.tieneManualEntry || cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#8B5CF6"
      stroke="white"
      strokeWidth={1.5}
    />
  );
}

export function CashflowProjectionChart({
  data,
  horizonte,
  umbralAlerta,
  companyColor = "#3B82F6",
}: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Sin datos de proyección disponibles.
      </div>
    );
  }

  // Sample to avoid crowding the x-axis
  const step = horizonte === 30 ? 5 : horizonte === 60 ? 10 : 15;
  const tickDates = new Set(
    data.filter((_, i) => i % step === 0).map((d) => d.fecha)
  );

  const tensionDay = data.find((d) => d.saldoProyectado < 0);

  return (
    <div className="space-y-2">
      {tensionDay && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-4 py-2 border border-red-200">
          <span>⚠️</span>
          <span>
            Tensión de liquidez proyectada el{" "}
            <strong>
              {new Date(tensionDay.fecha + "T00:00:00").toLocaleDateString(
                "es-AR"
              )}
            </strong>
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatAxisDate}
            ticks={data.filter((d) => tickDates.has(d.fecha)).map((d) => d.fecha)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) =>
              v >= 1_000_000
                ? `$${(v / 1_000_000).toFixed(1)}M`
                : v >= 1_000
                ? `$${(v / 1_000).toFixed(0)}K`
                : v < -1_000
                ? `-$${Math.abs(v / 1_000).toFixed(0)}K`
                : `$${v}`
            }
          />
          <Tooltip
            formatter={(value, name) => [
              ARS.format(Number(value)),
              String(name),
            ]}
            labelFormatter={(label) =>
              new Date(label + "T00:00:00").toLocaleDateString("es-AR", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            }
          />
          <Legend />

          {umbralAlerta !== undefined && (
            <ReferenceLine
              y={umbralAlerta}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              label={{ value: "Umbral", fontSize: 10, fill: "#F59E0B" }}
            />
          )}

          <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="2 2" />

          <Line
            type="monotone"
            dataKey="saldoProyectado"
            name="Saldo proyectado"
            stroke={companyColor}
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-400">
        🟣 Puntos violeta = ajustes manuales incluidos en la proyección
      </p>
    </div>
  );
}
