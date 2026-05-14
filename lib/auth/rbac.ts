import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { userCompanyRoles } from "@/lib/db/schema";
import type { DB } from "@/lib/db";

export type Role = "admin" | "operator" | "reader";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  operator: 2,
  reader: 1,
};

// Returns the validated companyId if the user has at least `minRole`.
// Throws if not authorized. Always pass the returned value to DB queries —
// never use the raw URL param after this gate.
export async function requireRole(
  userId: string,
  companyId: string,
  minRole: Role,
  database: DB = db
): Promise<string> {
  const [row] = await database
    .select({ role: userCompanyRoles.role })
    .from(userCompanyRoles)
    .where(
      and(
        eq(userCompanyRoles.userId, userId),
        eq(userCompanyRoles.companyId, companyId)
      )
    )
    .limit(1);

  if (!row) {
    throw new AuthorizationError(
      `User ${userId} has no role in company ${companyId}`
    );
  }

  if (ROLE_HIERARCHY[row.role] < ROLE_HIERARCHY[minRole]) {
    throw new AuthorizationError(
      `User ${userId} needs ${minRole} but has ${row.role} in company ${companyId}`
    );
  }

  return companyId;
}

// Returns all companyIds where user has at least minRole
export async function getAuthorizedCompanyIds(
  userId: string,
  minRole: Role = "reader",
  database: DB = db
): Promise<string[]> {
  const rows = await database
    .select({ companyId: userCompanyRoles.companyId, role: userCompanyRoles.role })
    .from(userCompanyRoles)
    .where(eq(userCompanyRoles.userId, userId));

  return rows
    .filter((r) => ROLE_HIERARCHY[r.role] >= ROLE_HIERARCHY[minRole])
    .map((r) => r.companyId);
}

export class AuthorizationError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
