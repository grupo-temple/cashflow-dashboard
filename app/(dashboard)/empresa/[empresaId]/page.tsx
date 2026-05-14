import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { getCompanyPosition, getComprobantesAbiertos } from "@/lib/db/queries/movements";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ComprobantesTable } from "@/components/dashboard/ComprobantesTable";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { calcularMetricas, getActiveAlerts } from "@/lib/insights/metrics";

interface PageProps {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

function getDefaultPeriod() {
  const hasta = new Date().toISOString().split("T")[0];
  const desdeDate = new Date();
  desdeDate.setDate(desdeDate.getDate() - 30);
  const desde = desdeDate.toISOString().split("T")[0];
  return { desde, hasta };
}

function isStale(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return false;
  return Date.now() - new Date(lastSyncAt).getTime() > 30 * 60 * 1000;
}

export default async function EmpresaPage({ params, searchParams }: PageProps) {
  const { empresaId } = await params;
  const sp = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Validate company exists
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, empresaId));

  if (!company) notFound();

  // RBAC gate — throws if unauthorized
  try {
    await requireRole(session.user.id, empresaId, "reader");
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }

  const { desde, hasta } = {
    desde: sp.desde ?? getDefaultPeriod().desde,
    hasta: sp.hasta ?? getDefaultPeriod().hasta,
  };

  const [position, cuentasACobrar, cuentasAPagar] = await Promise.all([
    getCompanyPosition({ companyId: empresaId, desde, hasta }),
    getComprobantesAbiertos(empresaId, "venta", hasta),
    getComprobantesAbiertos(empresaId, "compra", hasta),
  ]);

  const [metricas, activeAlerts] = await Promise.all([
    calcularMetricas(empresaId, position.saldoActual),
    getActiveAlerts(empresaId),
  ]);

  const stale = isStale(position.lastSyncAt);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: company.color }}
          />
          <h1 className="text-xl font-semibold text-gray-900">{company.name}</h1>
        </div>
        <PeriodSelector desde={desde} hasta={hasta} empresaId={empresaId} />
      </div>

      {/* Banners */}
      {stale && (
        <AlertBanner
          type="stale-data"
          message={`Último dato: hace ${Math.round((Date.now() - new Date(position.lastSyncAt!).getTime()) / 60000)} min. Sincronización puede estar fallida.`}
        />
      )}

      {position.saldoActual === null && (
        <AlertBanner
          type="warning"
          message="Saldo inicial no configurado. Configurá el saldo en Settings para ver la posición actual."
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo Actual"
          valueArs={position.saldoActual ?? 0}
          usdRate={position.usdRate}
          variant={
            position.saldoActual === null
              ? "warning"
              : position.saldoActual >= 0
              ? "default"
              : "negative"
          }
          subtitle={
            position.saldoActual === null
              ? "Sin saldo configurado"
              : position.saldoInicialFecha
              ? `Desde ${new Date(position.saldoInicialFecha + "T00:00:00").toLocaleDateString("es-AR")}`
              : undefined
          }
        />
        <KpiCard
          title="Cobros del Período"
          valueArs={position.cobrosTotal}
          usdRate={position.usdRate}
          variant="positive"
        />
        <KpiCard
          title="Pagos del Período"
          valueArs={position.pagosTotal}
          usdRate={position.usdRate}
          variant="negative"
        />
        <KpiCard
          title="Saldo Neto"
          valueArs={position.saldoNeto}
          usdRate={position.usdRate}
          variant={position.saldoNeto >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <AlertBanner
              key={alert.id}
              type={alert.severidad === "critical" ? "critical" : "warning"}
              message={alert.mensaje}
            />
          ))}
        </div>
      )}

      {/* Treasury Insights */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Indicadores de Tesorería</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <InsightCard
            title="Días de Caja"
            value={metricas.diasDeCaja !== null ? String(metricas.diasDeCaja) : null}
            subtitle="Días con el saldo actual"
            variant={
              metricas.diasDeCaja !== null && metricas.diasDeCaja < 15
                ? "warning"
                : "default"
            }
            nullLabel="Sin saldo / flujo"
          />
          <InsightCard
            title="DSO"
            value={metricas.dso !== null ? `${metricas.dso} días` : null}
            subtitle="Días promedio de cobro"
          />
          <InsightCard
            title="DPO"
            value={metricas.dpo !== null ? `${metricas.dpo} días` : null}
            subtitle="Días promedio de pago"
          />
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Top Clientes (AR)</p>
            {metricas.topClientesPorARPendiente.length === 0 ? (
              <p className="text-xs text-gray-400">Sin cuentas a cobrar</p>
            ) : (
              <ul className="space-y-1">
                {metricas.topClientesPorARPendiente.slice(0, 3).map((c, i) => (
                  <li key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600 truncate max-w-[120px]">
                      {c.razonSocial ?? c.cuit ?? "—"}
                    </span>
                    <span className="tabular-nums text-gray-900 font-medium">
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 0,
                      }).format(c.montoTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Cuentas a Cobrar
          </h2>
          <ComprobantesTable
            comprobantes={cuentasACobrar}
            tipo="venta"
            usdRate={position.usdRate}
          />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Cuentas a Pagar
          </h2>
          <ComprobantesTable
            comprobantes={cuentasAPagar}
            tipo="compra"
            usdRate={position.usdRate}
          />
        </div>
      </div>
    </main>
  );
}

function PeriodSelector({
  desde,
  hasta,
  empresaId,
}: {
  desde: string;
  hasta: string;
  empresaId: string;
}) {
  const presets = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
  ];

  return (
    <div className="flex gap-1">
      {presets.map(({ label, days }) => {
        const h = new Date().toISOString().split("T")[0];
        const d = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        const active = desde === d && hasta === h;
        return (
          <a
            key={label}
            href={`/empresa/${empresaId}?desde=${d}&hasta=${h}`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              active
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
