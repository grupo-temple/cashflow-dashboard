"use client";

interface Props {
  title: string;
  value: string | null;
  subtitle?: string;
  variant?: "default" | "warning" | "positive";
  nullLabel?: string;
}

export function InsightCard({
  title,
  value,
  subtitle,
  variant = "default",
  nullLabel = "Sin datos",
}: Props) {
  const valueColor =
    variant === "warning"
      ? "text-amber-600"
      : variant === "positive"
      ? "text-green-700"
      : "text-gray-900";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
      {value === null ? (
        <p className="text-sm text-gray-400">{nullLabel}</p>
      ) : (
        <>
          <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}
