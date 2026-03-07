import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    entries[key] = value;
  }
  return entries;
}

function cleanText(value) {
  return (value ?? "").toString().trim();
}

function toIsoDate(value) {
  const t = cleanText(value);
  return t || "9999-12-31T23:59:59.999Z";
}

async function getPortfolioTxCount(supabase, portfolioId) {
  const q = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId);
  if (q.error) throw new Error(`No se pudo contar transacciones para ${portfolioId}: ${q.error.message}`);
  return q.count ?? 0;
}

function chooseCanonical(portfolios, txCounts) {
  return [...portfolios].sort((a, b) => {
    const txA = txCounts.get(a.id) ?? 0;
    const txB = txCounts.get(b.id) ?? 0;
    if (txA !== txB) return txB - txA;

    const hasMgrA = a.manager_id ? 1 : 0;
    const hasMgrB = b.manager_id ? 1 : 0;
    if (hasMgrA !== hasMgrB) return hasMgrB - hasMgrA;

    const dateA = toIsoDate(a.created_at);
    const dateB = toIsoDate(b.created_at);
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    return cleanText(a.id).localeCompare(cleanText(b.id));
  })[0];
}

async function run() {
  const apply = process.argv.includes("--apply");
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("No existe .env.local");
  }

  const envFromFile = parseEnvFile(envPath);
  const supabaseUrl = envFromFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = envFromFile.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profilesQuery = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .in("role", ["cliente", "autonomo"])
    .order("created_at", { ascending: true });

  if (profilesQuery.error) {
    throw new Error(`Error consultando profiles: ${profilesQuery.error.message}`);
  }

  const profiles = (profilesQuery.data ?? []).map((row) => ({
    id: cleanText(row.id),
    full_name: cleanText(row.full_name),
    email: cleanText(row.email).toLowerCase(),
    role: row.role,
  })).filter((row) => row.id);

  if (profiles.length === 0) {
    console.log("DEDUPE_RESULT", JSON.stringify({ duplicatesOwners: 0, fixedOwners: 0, movedTx: 0, removedPortfolios: 0 }));
    return;
  }

  const ownerIds = profiles.map((p) => p.id);
  const portfoliosQuery = await supabase
    .from("portfolios")
    .select("id, name, owner_id, manager_id, created_at")
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: true });

  if (portfoliosQuery.error) {
    throw new Error(`Error consultando portfolios: ${portfoliosQuery.error.message}`);
  }

  const portfolios = (portfoliosQuery.data ?? []).map((row) => ({
    id: cleanText(row.id),
    name: cleanText(row.name),
    owner_id: cleanText(row.owner_id),
    manager_id: cleanText(row.manager_id) || null,
    created_at: row.created_at,
  })).filter((row) => row.id && row.owner_id);

  const byOwner = new Map();
  for (const pf of portfolios) {
    if (!byOwner.has(pf.owner_id)) byOwner.set(pf.owner_id, []);
    byOwner.get(pf.owner_id).push(pf);
  }

  const duplicateOwners = [...byOwner.entries()].filter(([, list]) => list.length > 1);

  if (duplicateOwners.length === 0) {
    console.log("DEDUPE_RESULT", JSON.stringify({ duplicatesOwners: 0, fixedOwners: 0, movedTx: 0, removedPortfolios: 0 }));
    return;
  }

  const txCounts = new Map();
  for (const [, list] of duplicateOwners) {
    for (const pf of list) {
      if (!txCounts.has(pf.id)) {
        const count = await getPortfolioTxCount(supabase, pf.id);
        txCounts.set(pf.id, count);
      }
    }
  }

  const plan = duplicateOwners.map(([ownerId, list]) => {
    const canonical = chooseCanonical(list, txCounts);
    const duplicates = list.filter((item) => item.id !== canonical.id);
    const ownerProfile = profiles.find((p) => p.id === ownerId);

    let desiredManagerId = canonical.manager_id;
    if (ownerProfile?.role === "cliente" && !desiredManagerId) {
      const found = duplicates.find((pf) => pf.manager_id);
      desiredManagerId = found?.manager_id ?? null;
    }
    if (ownerProfile?.role === "autonomo") {
      desiredManagerId = null;
    }

    return {
      ownerId,
      ownerEmail: ownerProfile?.email ?? "",
      ownerName: ownerProfile?.full_name ?? "",
      role: ownerProfile?.role ?? null,
      canonical,
      duplicates,
      desiredManagerId,
    };
  });

  const preview = plan.map((item) => ({
    ownerId: item.ownerId,
    owner: item.ownerName || item.ownerEmail,
    role: item.role,
    canonical: item.canonical.id,
    canonicalName: item.canonical.name,
    duplicateIds: item.duplicates.map((d) => d.id),
    duplicateCount: item.duplicates.length,
  }));

  console.log("DEDUPE_PREVIEW", JSON.stringify(preview));

  if (!apply) {
    console.log("DRY_RUN_OK", JSON.stringify({ duplicatesOwners: duplicateOwners.length }));
    return;
  }

  let fixedOwners = 0;
  let movedTx = 0;
  let removedPortfolios = 0;

  for (const item of plan) {
    let ownerTouched = false;

    if (item.desiredManagerId !== item.canonical.manager_id) {
      const up = await supabase
        .from("portfolios")
        .update({ manager_id: item.desiredManagerId })
        .eq("id", item.canonical.id)
        .select("id")
        .maybeSingle();

      if (up.error) {
        throw new Error(`No se pudo actualizar manager canónico ${item.canonical.id}: ${up.error.message}`);
      }
      ownerTouched = true;
    }

    for (const duplicate of item.duplicates) {
      const txCount = txCounts.get(duplicate.id) ?? 0;
      if (txCount > 0) {
        const move = await supabase
          .from("transactions")
          .update({ portfolio_id: item.canonical.id })
          .eq("portfolio_id", duplicate.id);

        if (move.error) {
          throw new Error(`No se pudieron mover transacciones ${duplicate.id} -> ${item.canonical.id}: ${move.error.message}`);
        }

        movedTx += txCount;
      }

      const del = await supabase
        .from("portfolios")
        .delete()
        .eq("id", duplicate.id)
        .select("id")
        .maybeSingle();

      if (del.error) {
        throw new Error(`No se pudo eliminar portfolio duplicado ${duplicate.id}: ${del.error.message}`);
      }

      removedPortfolios += 1;
      ownerTouched = true;
    }

    if (ownerTouched) fixedOwners += 1;
  }

  console.log(
    "DEDUPE_APPLY_OK",
    JSON.stringify({
      duplicatesOwners: duplicateOwners.length,
      fixedOwners,
      movedTx,
      removedPortfolios,
    }),
  );
}

run().catch((error) => {
  console.error("DEDUPE_APPLY_ERROR", error?.message ?? error);
  process.exitCode = 1;
});
