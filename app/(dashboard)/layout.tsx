import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getAuthorizedCompanyIds } from "@/lib/auth/rbac";
import { inArray } from "drizzle-orm";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const authorizedIds = await getAuthorizedCompanyIds(session.user.id, "reader");

  const userCompanies =
    authorizedIds.length > 0
      ? await db
          .select()
          .from(companies)
          .where(inArray(companies.id, authorizedIds))
      : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-semibold text-gray-900 hover:text-blue-600"
          >
            Grupo Económico
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Consolidado
            </Link>
            <Link
              href="/comparativa"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Comparativa
            </Link>
          </div>

          <div className="flex items-center gap-1">
            {userCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/empresa/${c.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Configuración
          </Link>
          <span className="text-xs text-gray-400">{session.user.email}</span>
        </div>
      </nav>

      {children}
    </div>
  );
}
