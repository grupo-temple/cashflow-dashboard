import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { getAuthorizedCompanyIds } from "@/lib/auth/rbac";
import { getCompanyPosition } from "@/lib/db/queries/movements";
import { calcularProyeccion } from "@/lib/projections/cashflow";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CompanyComparisonChart } from "@/components/charts/CompanyComparisonChart";

export default async function ComparativaPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const companyIds = await getAuthorizedCompanyIds(session.user.id, "reader");

  const userCompanies =
    companyIds.length > 0
      ? await db.select().from(companies).where(inArray(companies.id, companyIds))
      : [];

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];

  const positions = await Promise.all(
    userCompanies.map((c) =>
      getCompanyPosition({ companyId: c.id, desde: thirtyDaysAgo, hasta: today })
    )
  );

  const chartData = userCompanies.map((c, i) => ({
    name: c.name,
    saldoActual: positions[i].saldoActual ?? 0,
    cobros: positions[i].cobrosTotal,
    pagos: positions[i].pagosTotal,
    color: c.color,
  }));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">
        Vista Comparativa
      </h1>

      {/* Comparison chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Saldo Actual y Flujo — Últimos 30 días
        </h2>
        <CompanyComparisonChart data={chartData} />
      </div>

      {/* Side by side KPI cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {userCompanies.map((company, i) => {
          const pos = positions[i];
          return (
            <div
              key={company.id}
              className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
              style={{ borderTopColor: company.color, borderTopWidth: 3 }}
            >
              <h3 className="font-semibold text-gray-900">{company.name}</h3>

              {pos.saldoActual === null ? (
                <p className="text-xs text-amber-600">Sin saldo inicial configurado</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Saldo Actual</span>
                    <span
                      className={`font-medium tabular-nums ${
                        pos.saldoActual >= 0 ? "text-gray-900" : "text-red-600"
                      }`}
                    >
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 0,
                      }).format(pos.saldoActual)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cobros 30d</span>
                    <span className="text-green-700 tabular-nums">
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 0,
                      }).format(pos.cobrosTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pagos 30d</span>
                    <span className="text-red-600 tabular-nums">
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 0,
                      }).format(pos.pagosTotal)}
                    </span>
                  </div>
                </div>
              )}

              <a
                href={`/empresa/${company.id}`}
                className="block text-xs text-blue-600 hover:text-blue-700"
              >
                Ver detalle →
              </a>
            </div>
          );
        })}
      </div>
    </main>
  );
}
