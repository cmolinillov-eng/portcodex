import type { SupabaseClient } from "@supabase/supabase-js";

type AppRole = "autonomo" | "admin" | "cliente";

type ProfileForOwnership = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  role: AppRole | null;
};

type OwnerPortfolioRow = {
  id?: string | null;
  owner_id?: string | null;
  manager_id?: string | null;
  created_at?: string | null;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function buildDefaultPortfolioName(fullName: string, email: string): string {
  const preferred = cleanText(fullName);
  if (preferred.length > 0) return `Portfolio de ${preferred}`;

  const localPart = cleanText(email.split("@")[0] ?? "");
  if (localPart.length > 0) return `Portfolio de ${localPart}`;

  return "Cartera Principal";
}

function shouldHaveOwnedPortfolio(role: AppRole | null): boolean {
  return role === "autonomo" || role === "cliente";
}

function normalizeProfiles(profiles: ProfileForOwnership[]): Array<{
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
}> {
  return profiles
    .map((profile) => ({
      id: cleanText(profile.id),
      fullName: cleanText(profile.full_name),
      email: cleanText(profile.email).toLowerCase(),
      role: profile.role,
    }))
    .filter((profile): profile is { id: string; fullName: string; email: string; role: AppRole } => {
      return profile.id.length > 0 && shouldHaveOwnedPortfolio(profile.role);
    });
}

function toSortableDate(value: string | null | undefined): string {
  const dateText = cleanText(value);
  return dateText.length > 0 ? dateText : "9999-12-31T23:59:59.999Z";
}

async function getTransactionCount(client: SupabaseClient, portfolioId: string): Promise<number> {
  const query = await client
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId);

  if (query.error) {
    throw new Error(`No se pudo contar transacciones del portfolio ${portfolioId}: ${query.error.message}`);
  }

  return query.count ?? 0;
}

function chooseCanonicalPortfolio(
  rows: Array<{ id: string; managerId: string | null; createdAt: string | null }>,
  txCountByPortfolioId: Map<string, number>,
): { id: string; managerId: string | null; createdAt: string | null } {
  return [...rows].sort((a, b) => {
    const txA = txCountByPortfolioId.get(a.id) ?? 0;
    const txB = txCountByPortfolioId.get(b.id) ?? 0;
    if (txA !== txB) return txB - txA;

    const hasManagerA = a.managerId ? 1 : 0;
    const hasManagerB = b.managerId ? 1 : 0;
    if (hasManagerA !== hasManagerB) return hasManagerB - hasManagerA;

    const createdA = toSortableDate(a.createdAt);
    const createdB = toSortableDate(b.createdAt);
    if (createdA !== createdB) return createdA.localeCompare(createdB);

    return a.id.localeCompare(b.id);
  })[0];
}

async function consolidateDuplicateOwnedPortfolios(
  client: SupabaseClient,
  ownerId: string,
  ownerRole: AppRole,
  rows: Array<{ id: string; managerId: string | null; createdAt: string | null }>,
): Promise<{ consolidated: boolean }> {
  if (rows.length <= 1) {
    return { consolidated: false };
  }

  const txCountByPortfolioId = new Map<string, number>();
  for (const row of rows) {
    txCountByPortfolioId.set(row.id, await getTransactionCount(client, row.id));
  }

  const canonical = chooseCanonicalPortfolio(rows, txCountByPortfolioId);
  const duplicates = rows.filter((row) => row.id !== canonical.id);

  let desiredManagerId = canonical.managerId;
  if (ownerRole === "autonomo") {
    desiredManagerId = null;
  } else if (ownerRole === "cliente" && !desiredManagerId) {
    const fallback = duplicates.find((row) => row.managerId);
    desiredManagerId = fallback?.managerId ?? null;
  }

  if (desiredManagerId !== canonical.managerId) {
    const updateCanonical = await client
      .from("portfolios")
      .update({ manager_id: desiredManagerId })
      .eq("id", canonical.id)
      .select("id")
      .maybeSingle();

    if (updateCanonical.error) {
      throw new Error(`No se pudo ajustar manager del portfolio canónico ${canonical.id}: ${updateCanonical.error.message}`);
    }
  }

  for (const duplicate of duplicates) {
    const txCount = txCountByPortfolioId.get(duplicate.id) ?? 0;

    if (txCount > 0) {
      const moveTx = await client
        .from("transactions")
        .update({ portfolio_id: canonical.id })
        .eq("portfolio_id", duplicate.id);

      if (moveTx.error) {
        throw new Error(
          `No se pudieron mover transacciones de ${duplicate.id} a ${canonical.id}: ${moveTx.error.message}`,
        );
      }
    }

    const deleteDuplicate = await client
      .from("portfolios")
      .delete()
      .eq("id", duplicate.id)
      .select("id")
      .maybeSingle();

    if (deleteDuplicate.error) {
      throw new Error(`No se pudo eliminar portfolio duplicado ${duplicate.id}: ${deleteDuplicate.error.message}`);
    }
  }

  return { consolidated: true };
}

export async function ensureOwnedPortfoliosForProfiles(
  client: SupabaseClient,
  profiles: ProfileForOwnership[],
): Promise<{ created: number; consolidatedOwners: number }> {
  const candidates = normalizeProfiles(profiles);
  if (candidates.length === 0) {
    return { created: 0, consolidatedOwners: 0 };
  }

  const ownerIds = candidates.map((profile) => profile.id);
  const candidateById = new Map(candidates.map((profile) => [profile.id, profile]));

  const existingQuery = await client
    .from("portfolios")
    .select("id, owner_id, manager_id, created_at")
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: true });

  if (existingQuery.error) {
    throw new Error(`No se pudo comprobar portfolios existentes: ${existingQuery.error.message}`);
  }

  const existingRows = ((existingQuery.data ?? []) as OwnerPortfolioRow[])
    .map((row) => ({
      id: cleanText(row.id),
      ownerId: cleanText(row.owner_id),
      managerId: cleanText(row.manager_id) || null,
      createdAt: row.created_at ?? null,
    }))
    .filter((row) => row.id.length > 0 && row.ownerId.length > 0);

  const rowsByOwner = new Map<string, Array<{ id: string; managerId: string | null; createdAt: string | null }>>();
  for (const row of existingRows) {
    if (!rowsByOwner.has(row.ownerId)) rowsByOwner.set(row.ownerId, []);
    rowsByOwner.get(row.ownerId)?.push({ id: row.id, managerId: row.managerId, createdAt: row.createdAt });
  }

  let consolidatedOwners = 0;
  for (const [ownerId, rows] of rowsByOwner.entries()) {
    const owner = candidateById.get(ownerId);
    if (!owner) continue;

    const result = await consolidateDuplicateOwnedPortfolios(client, ownerId, owner.role, rows);
    if (result.consolidated) {
      consolidatedOwners += 1;
      rowsByOwner.set(ownerId, rows.slice(0, 1));
    }
  }

  const ownerIdsWithPortfolio = new Set<string>([...rowsByOwner.keys()]);
  const missingProfiles = candidates.filter((profile) => !ownerIdsWithPortfolio.has(profile.id));
  if (missingProfiles.length === 0) {
    return { created: 0, consolidatedOwners };
  }

  let created = 0;

  for (const profile of missingProfiles) {
    const ownerCheck = await client
      .from("portfolios")
      .select("id")
      .eq("owner_id", profile.id)
      .limit(1);

    if (ownerCheck.error) {
      throw new Error(`No se pudo comprobar ownership para ${profile.id}: ${ownerCheck.error.message}`);
    }

    if ((ownerCheck.data ?? []).length > 0) {
      continue;
    }

    const insertQuery = await client
      .from("portfolios")
      .insert({
        name: buildDefaultPortfolioName(profile.fullName, profile.email),
        owner_id: profile.id,
        manager_id: null,
      })
      .select("id")
      .maybeSingle();

    if (insertQuery.error) {
      const code = cleanText((insertQuery.error as { code?: string }).code);
      if (code === "23505") {
        // Si otro request lo creó a la vez, continuamos sin romper el flujo.
        continue;
      }
      throw new Error(`No se pudo crear portfolio para ${profile.id}: ${insertQuery.error.message}`);
    }

    if (cleanText((insertQuery.data as OwnerPortfolioRow | null)?.id).length > 0) {
      created += 1;
    }
  }

  return { created, consolidatedOwners };
}
