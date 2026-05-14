import { formatDualCurrency } from "@/lib/db/queries/exchange_rates";

interface KpiCardProps {
  title: string;
  valueArs: number;
  usdRate: number | null;
  variant?: "default" | "positive" | "negative" | "warning";
  subtitle?: string;
}

const CURRENCY_FORMATTER_ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const CURRENCY_FORMATTER_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function KpiCard({
  title,
  valueArs,
  usdRate,
  variant = "default",
  subtitle,
}: KpiCardProps) {
  const { usd } = formatDualCurrency(valueArs, usdRate);

  const variantClass = {
    default: "text-gray-900",
    positive: "text-green-700",
    negative: "text-red-700",
    warning: "text-amber-700",
  }[variant];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {title}
      </p>
      <p className={`text-2xl font-semibold tabular-nums ${variantClass}`}>
        {CURRENCY_FORMATTER_ARS.format(valueArs)}
      </p>
      {usd !== null && (
        <p className="text-sm text-gray-400 tabular-nums mt-0.5">
          {CURRENCY_FORMATTER_USD.format(usd)}
        </p>
      )}
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
