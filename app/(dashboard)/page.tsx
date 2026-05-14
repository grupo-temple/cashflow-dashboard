import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { getAuthorizedCompanyIds } from "@/lib/auth/rbac";
import { calcularProyeccion } from "@/lib/projections/cashflow";
import { getCompanyPosition } from "@/lib/db/queries/movements";
import { CashflowProjectionChart } from "@/components/charts/CashflowProjectionChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { IntercompanyToggle } from "@/components/dashboard/IntercompanyToggle";
import { ManualEntryForm } from "@/components/dashboard/ManualEntryForm";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ horizonte?: string; excluirIntercompany?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const sp = await searchParams;
  const horizonte = ([30, 60, 90].includes(Number(sp.horizonte))
    ? Number(sp.horizonte)
    : 30) as 30 | 60 | 90;
  const excluirIntercompany = sp.excluirIntercompany === "true";

  const companyIds = await getAuthorizedCompanyIds(session.user.id, "reader");
  const operatorIds = await getAuthorizedCompanyIds(session.user.id, "operator");

  const userCompanies =
    companyIds.length > 0
      ? await db.select().from(companies).where(inArray(companies.id, companyIds))
      : [];

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];

  const [projection, positions] = await Promise.all([
    calcularProyeccion({ companyIds, horizonte, excluirIntercompany }),
    Promise.all(
      userCompanies.map((c) =>
        getCompanyPosition({
          companyId: c.id,
          desde: thirtyDaysAgo,
          hasta: today,
        })
      )
    ),
  ]);

  const totalSaldo = positions.reduce((s, p) => s + (p.saldoActual ?? 0), 0);
  const totalCobros = positions.reduce((s, p) => s + p.cobrosTotal, 0);
  const totalPagos = positions.reduce((s, p) => s + p.pagosTotal, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">
          Vista Consolidada del Grupo
        </h1>

        <div className="flex items-center gap-2">
          <IntercompanyToggle excluirIntercompany={excluirIntercompany} />
          <HorizonteSelector horizonte={horizonte} excluirIntercompany={excluirIntercompany} />
        </div>
      </div>

      {projection.saldoActual === null && projection.dataQuality === "saldo_inicial_required" ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Configurá el saldo inicial en al menos una empresa para ver la proyección consolidada.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Saldo Actual Grupo"
              valueArs={totalSaldo}
              usdRate={projection.usdRate}
              variant={totalSaldo >= 0 ? "default" : "negative"}
            />
            <KpiCard
              title="Cobros 30d"
              valueArs={totalCobros}
              usdRate={projection.usdRate}
              variant="positive"
            />
            <KpiCard
              title="Pagos 30d"
              valueArs={totalPagos}
              usdRate={projection.usdRate}
              variant="negative"
            />
            {projection.proyeccion.length > 0 && (
              <KpiCard
                title={`Saldo T+${horizonte}`}
                valueArs={
                  projection.proyeccion[projection.proyeccion.length - 1]
                    ?.saldoProyectado ?? 0
                }
                usdRate={projection.usdRate}
                variant={
                  (projection.proyeccion[projection.proyeccion.length - 1]
                    ?.saldoProyectado ?? 0) >= 0
                    ? "positive"
                    : "negative"
                }
              />
            )}
          </div>

          {/* Per-company saldo summary */}
          <div className="grid md:grid-cols-3 gap-4">
            {userCompanies.map((c, i) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border p-4 flex items-center justify-between"
                style={{ borderLeftColor: c.color, borderLeftWidth: 3 }}
              >
                <div>
                  <p className="text-xs font-medium text-gray-500">{c.name}</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      (positions[i]?.saldoActual ?? 0) >= 0
                        ? "text-gray-900"
                        : "text-red-600"
                    }`}
                  >
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      maximumFractionDigits: 0,
                    }).format(positions[i]?.saldoActual ?? 0)}
                  </p>
                </div>
                <a
                  href={`/empresa/${c.id}`}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Ver detalle →
                </a>
              </div>
            ))}
          </div>

          {/* Projection chart */}
          {projection.proyeccion.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Proyección Consolidada — {horizonte} días
              </h2>
              <CashflowProjectionChart
                data={projection.proyeccion}
                horizonte={horizonte}
              />
              <div className="mt-4">
                {operatorIds.length > 0 && (
                  <ManualEntryForm
                    companyId={operatorIds[0]}
                    canCreate={true}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function HorizonteSelector({
  horizonte,
  excluirIntercompany,
}: {
  horizonte: number;
  excluirIntercompany: boolean;
}) {
  return (
    <div className="flex gap-1">
      {[30, 60, 90].map((h) => (
        <a
          key={h}
          href={`/?horizonte=${h}&excluirIntercompany=${excluirIntercompany}`}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            horizonte === h
              ? "bg-blue-100 text-blue-700"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {h}d
        </a>
      ))}
    </div>
  );
}
