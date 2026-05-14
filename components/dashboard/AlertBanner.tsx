interface AlertBannerProps {
  type: "stale-data" | "tension" | "warning" | "critical";
  message: string;
}

export function AlertBanner({ type, message }: AlertBannerProps) {
  const styles = {
    "stale-data": "bg-amber-50 border-amber-200 text-amber-800",
    tension: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    critical: "bg-red-50 border-red-300 text-red-900",
  }[type];

  const icons = {
    "stale-data": "⚠️",
    tension: "🔴",
    warning: "⚠️",
    critical: "🔴",
  }[type];

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <span aria-hidden="true">{icons}</span>
      <p>{message}</p>
    </div>
  );
}
