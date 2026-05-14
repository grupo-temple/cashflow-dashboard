import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies, alertConfigs } from "@/lib/db/schema";
import { getAuthorizedCompanyIds } from "@/lib/auth/rbac";
import { getLatestExchangeRate } from "@/lib/db/queries/exchange_rates";
import { inArray, eq } from "drizzle-orm";
import { ExchangeRateWidget } from "@/components/dashboard/ExchangeRateWidget";
import { AlertConfigForm } from "@/components/dashboard/AlertConfigForm";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const adminCompanyIds = await getAuthorizedCompanyIds(session.user.id, "admin");
  const readerCompanyIds = await getAuthorizedCompanyIds(session.user.id, "reader");

  const allAuthorizedIds = [...new Set([...adminCompanyIds, ...readerCompanyIds])];

  const allCompanies =
    allAuthorizedIds.length > 0
      ? await db
          .select()
          .from(companies)
          .where(inArray(companies.id, allAuthorizedIds))
      : [];

  const [ratesByCompany, allAlertConfigs] = await Promise.all([
    Promise.all(allCompanies.map((c) => getLatestExchangeRate(c.id))),
    allAuthorizedIds.length > 0
      ? db
          .select()
          .from(alertConfigs)
          .where(inArray(alertConfigs.companyId, allAuthorizedIds))
      : Promise.resolve([]),
  ]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>

      {/* Exchange Rates Section */}
      <section>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
          Tipos de Cambio
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {allCompanies.map((company, i) => (
            <ExchangeRateWidget
              key={company.id}
              companyId={company.id}
              companyName={company.name}
              currentRate={ratesByCompany[i]?.valorArsPorUsd ?? null}
              currentFecha={ratesByCompany[i]?.fechaVigencia ?? null}
              canEdit={adminCompanyIds.includes(company.id)}
            />
          ))}
        </div>
      </section>

      {/* Alert Configs Section — admin only */}
      {adminCompanyIds.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
            Alertas de Tesorería
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {allCompanies
              .filter((c) => adminCompanyIds.includes(c.id))
              .map((company) => {
                const configs = allAlertConfigs.filter(
                  (ac) => ac.companyId === company.id
                );
                const saldoBajo = configs.find((c) => c.tipo === "saldo_bajo");
                const facturaVencida = configs.find(
                  (c) => c.tipo === "factura_vencida"
                );
                return (
                  <AlertConfigForm
                    key={company.id}
                    companyId={company.id}
                    companyName={company.name}
                    existingSaldoBajo={
                      saldoBajo
                        ? {
                            umbral: saldoBajo.umbral,
                            diasAnticipacion: saldoBajo.diasAnticipacion,
                            activo: saldoBajo.activo,
                          }
                        : null
                    }
                    existingFacturaVencida={
                      facturaVencida
                        ? {
                            umbral: facturaVencida.umbral,
                            activo: facturaVencida.activo,
                          }
                        : null
                    }
                  />
                );
              })}
          </div>
        </section>
      )}
    </main>
  );
}
