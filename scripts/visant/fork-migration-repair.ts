/**
 * After an upstream sync moved the fork's own migration (`*_agent_personal_mcp`) to the end of the journal, a database
 * that ran it at its old place no longer matches the build: the boot guard compares migrations by position
 * (packages/db/src/migration-guard.ts) and refuses with MigrationMismatchError. The repair forgets that one record in
 * `drizzle.__drizzle_migrations` (the column it added stays): upstream's migrations then run in their places and the
 * fork's, idempotent (IF NOT EXISTS), runs again at the end as a no-op and is recorded there.
 *
 *   bun scripts/visant/fork-migration-repair.ts <DATABASE_URL>            say what is wrong and what it would forget
 *   bun scripts/visant/fork-migration-repair.ts <DATABASE_URL> --sql      print the one DELETE, to run with psql
 *   bun scripts/visant/fork-migration-repair.ts <DATABASE_URL> --apply    forget it (in one transaction)
 *
 * It forgets only records of a version of the fork's migration git has seen that sit out of their place, and only when the
 * database matches the build once they are gone: anything else is refused and left untouched.
 * Run it with the server stopped, against the database the new image will boot on, before `docker compose up -d`.
 */
import { createHash } from "node:crypto";
import { $ } from "bun";
// The root has no workspace of its own: the db package by its path, as seed-demo.ts does.
import {
  appliedMigrations,
  checkMigrations,
  createDatabase,
  knownMigrations,
  migrationsFolder,
  sql,
} from "../../packages/db/src/index.ts";

const [url, mode] = [process.argv[2] ?? process.env.DATABASE_URL, process.argv[3]];
if (!url) throw new Error("usage: fork-migration-repair.ts <DATABASE_URL> [--sql | --apply]");

/** Every version of the fork's migration git has seen, by the hash drizzle records (sha256 of the file). */
async function forkHashes(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const log =
    await $`git log --all --format=%H --name-only --diff-filter=AM -- ${"packages/db/migrations/*_agent_personal_mcp.sql"}`.text();
  let commit = "";
  for (const line of log.split("\n").map((l) => l.trim())) {
    if (/^[0-9a-f]{40}$/.test(line)) commit = line;
    else if (line.endsWith(".sql") && commit) {
      const text = await $`git show ${`${commit}:${line}`}`.nothrow().quiet().text();
      if (text)
        out.set(createHash("sha256").update(text).digest("hex"), `${line.split("/").pop()} (${commit.slice(0, 9)})`);
    }
  }
  return out;
}

const handle = createDatabase({ url, poolMax: 1 });
try {
  const known = knownMigrations(migrationsFolder);
  const applied = await appliedMigrations(handle.db);
  const problem = checkMigrations(applied, known);
  if (!problem) {
    console.log(`Nothing to repair: the database's ${applied.length} migrations match this build's ${known.length}.`);
    process.exit(0);
  }
  console.log(`The build would refuse this database: ${problem}`);

  // The fork's record out of the place the build gives it: its file may be byte for byte today's (same hash), only its
  // place moved. Anything else this build doesn't know is someone else's and is left alone.
  const fork = await forkHashes();
  const knownHashes = new Set(known.map((k) => k.hash));
  const orphans = applied.filter((a, i) => fork.has(a.hash) && known[i]?.hash !== a.hash);
  const strangers = applied.filter((a) => !knownHashes.has(a.hash) && !fork.has(a.hash));
  if (!orphans.length || strangers.length) {
    console.log(
      strangers.length
        ? `Refused: ${strangers.length} applied migration(s) are neither this build's nor a version of the fork's (${strangers.map((x) => x.hash.slice(0, 12)).join(", ")}). Look at them by hand.`
        : "Refused: the fork's migration is not out of its place, so the mismatch is something else. Look at it by hand.",
    );
    process.exit(1);
  }
  const after = checkMigrations(
    applied.filter((a) => !orphans.includes(a)),
    known,
  );
  if (after) {
    console.log(`Refused: even without the fork's record the database would not match: ${after}`);
    process.exit(1);
  }
  for (const o of orphans)
    console.log(`Would forget: ${fork.get(o.hash)}, applied at ${new Date(o.createdAt).toISOString()}`);

  // By hash AND date: a record of the same file at its right place (today's) is never touched.
  if (mode === "--sql") {
    const where = orphans.map((o) => `(hash = '${o.hash}' AND created_at = ${o.createdAt})`).join(" OR ");
    console.log(`\nDELETE FROM drizzle.__drizzle_migrations WHERE ${where};`);
  } else if (mode === "--apply") {
    await handle.db.transaction(async (tx) => {
      for (const o of orphans) {
        await tx.execute(
          sql`delete from drizzle.__drizzle_migrations where hash = ${o.hash} and created_at = ${o.createdAt}`,
        );
      }
    });
    const left = checkMigrations(await appliedMigrations(handle.db), known);
    console.log(
      left ? `Forgot it, but: ${left}` : "Forgot it. The build's migrations now run in their places on its next boot.",
    );
    if (left) process.exit(1);
  } else {
    console.log("\nNothing changed. --sql prints the statement, --apply runs it.");
  }
} finally {
  await handle.close();
}
