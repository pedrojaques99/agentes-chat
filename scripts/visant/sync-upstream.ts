#!/usr/bin/env bun
/**
 * Brings the fork's visant/build up to upstream main, or says why it can't.
 *
 *   bun scripts/visant/sync-upstream.ts            merge, check, leave the result committed locally
 *   bun scripts/visant/sync-upstream.ts --check    only say what a merge would bring and whether it would collide
 *
 * The checks, in order:
 *   1. Migrations: the server compares the database's migrations with the build's BY POSITION
 *      (packages/db/src/migration-guard.ts). A migration of ours sitting at an index upstream also uses breaks every
 *      database that ran ours. So a fork migration must never share an index with upstream's: send schema changes
 *      upstream as a PR instead.
 *   2. The merge itself: any conflict aborts and lists the files; nothing is left half-merged.
 *   3. After the merge: the journal is still dated in order, then typecheck. Lint runs only if typecheck passed.
 *
 * Exit 0: up to date or merged and checked. Exit 1: something needs a person; the reason is the last line printed.
 * Used by .github/workflows/visant-sync-upstream.yml twice a day, and by hand.
 */
import { $ } from "bun";

const UPSTREAM = "upstream";
const BRANCH = "main";
const JOURNAL = "packages/db/migrations/meta/_journal.json";
const checkOnly = process.argv.includes("--check");

type Entry = { idx: number; tag: string; when: number };

function fail(why: string): never {
  console.error(`\nSYNC STOPPED: ${why}`);
  process.exit(1);
}

async function journalAt(ref: string): Promise<Entry[]> {
  const text = await $`git show ${ref}:${JOURNAL}`.quiet().text();
  return (JSON.parse(text) as { entries: Entry[] }).entries;
}

const remotes = (await $`git remote`.quiet().text()).split("\n");
if (!remotes.includes(UPSTREAM)) await $`git remote add ${UPSTREAM} https://github.com/agentes-chat/agentes-chat.git`;
await $`git fetch --quiet ${UPSTREAM} ${BRANCH}`;
const theirs = `${UPSTREAM}/${BRANCH}`;

const behind = Number((await $`git rev-list --count HEAD..${theirs}`.quiet().text()).trim());
const ahead = Number((await $`git rev-list --count ${theirs}..HEAD`.quiet().text()).trim());
console.log(`visant/build: ${behind} behind upstream, ${ahead} of our own.`);
if (behind === 0) {
  console.log("Already up to date.");
  process.exit(0);
}

// 1. Migrations that would share an index with upstream's.
const [ours, up] = await Promise.all([journalAt("HEAD"), journalAt(theirs)]);
const upTags = new Set(up.map((e) => e.tag));
const lastUp = up.at(-1)?.idx ?? -1;
const collisions = ours.filter((e) => !upTags.has(e.tag) && e.idx <= lastUp);
const newUp = up.filter((e) => !ours.some((o) => o.tag === e.tag));
if (newUp.length) console.log(`Upstream migrations coming: ${newUp.map((e) => e.tag).join(", ")}`);
if (collisions.length) {
  fail(
    `our migration(s) ${collisions.map((e) => e.tag).join(", ")} sit at an index upstream now uses. ` +
      "Drop ours from the fork (send the change upstream, regenerated after their latest), and on any database that " +
      "ran it delete its row from drizzle.__drizzle_migrations after a backup.",
  );
}

console.log("\nNew upstream commits:");
console.log(
  (await $`git log --oneline --no-merges HEAD..${theirs}`.quiet().text()).split("\n").slice(0, 30).join("\n"),
);
if (checkOnly) process.exit(0);

// 2. The merge.
const merged = await $`git merge --no-edit ${theirs}`.nothrow().quiet();
if (merged.exitCode !== 0) {
  const files = (await $`git diff --name-only --diff-filter=U`.quiet().text()).trim();
  await $`git merge --abort`.nothrow().quiet();
  fail(`merge conflicts in:\n${files}`);
}

// 3. After the merge.
const after = await journalAt("HEAD");
for (let i = 1; i < after.length; i++) {
  const [a, b] = [after[i - 1] as Entry, after[i] as Entry];
  if (b.when <= a.when) fail(`migration ${b.tag} is dated before ${a.tag}: databases would skip it.`);
}
console.log("\nInstalling and checking types...");
await $`bun install --frozen-lockfile`.quiet().nothrow();
if ((await $`bun run typecheck`.nothrow()).exitCode !== 0)
  fail("typecheck failed after the merge (left merged locally).");
if ((await $`bun run lint`.nothrow().quiet()).exitCode !== 0)
  fail("lint failed after the merge (left merged locally).");
console.log(`\nMerged ${behind} upstream commits into visant/build. Push with: git push origin visant/build`);
