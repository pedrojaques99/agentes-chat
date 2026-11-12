// What the import screen would make of a package, without a server: the same parser the web app runs
// (packages/client/src/lib/import), over a .json bundle, a .tar.gz (extracted with the system's tar) or a folder.
// Prints the agents, skills, channels, routines and notes it found, and what it left out or would have to do.
//
//   bun scripts/visant/import-dry-run.ts <file-or-folder> [...more]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { type ImportFile, parsePackage } from "../../packages/client/src/lib/import";

const walk = (dir: string, root = dir): ImportFile[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) return walk(path, root);
    const rel = relative(root, path).replaceAll("\\", "/");
    return [{ name: rel, text: s.size < 2_000_000 ? readFileSync(path, "utf8") : "", size: s.size }];
  });

const filesOf = (input: string): ImportFile[] => {
  if (statSync(input).isDirectory()) return walk(input);
  if (/\.(tar\.gz|tgz)$/i.test(input)) {
    const out = mkdtempSync(join(tmpdir(), "import-dry-run-"));
    // GNU tar reads `C:` as a remote host unless told the archive is local.
    const local = process.platform === "win32" ? ["--force-local"] : [];
    execFileSync("tar", [...local, "-xzf", input, "-C", out]);
    // Like the web's reader: paths relative to the one folder everything is in.
    const tops = readdirSync(out);
    const [top] = tops;
    return tops.length === 1 && top && statSync(join(out, top)).isDirectory() ? walk(join(out, top)) : walk(out);
  }
  const name = input.split(/[\\/]/).pop() ?? input;
  return [{ name, text: readFileSync(input, "utf8") }];
};

for (const input of process.argv.slice(2)) {
  console.log(`\n# ${input}`);
  try {
    const { bundle } = parsePackage(filesOf(input));
    console.log(`source: ${bundle.source.app} · ${bundle.source.name}`);
    console.log(
      `agents (${bundle.agents.length}): ${bundle.agents.map((a) => `${a.handle} [${a.instructions.length} chars, ${a.skills.length} skills]`).join(", ")}`,
    );
    console.log(`skills (${bundle.skills.length}): ${bundle.skills.map((s) => s.key).join(", ")}`);
    for (const c of bundle.channels) console.log(`channel #${c.name}: ${c.agents.map((a) => a.key).join(", ")}`);
    for (const r of bundle.routines) console.log(`routine ${r.name} → ${r.agent}: ${JSON.stringify(r.trigger)}`);
    console.log(`notes: ${bundle.notes.length}`);
    for (const t of bundle.todo) console.log(`todo ${t.kind}: ${t.label}`);
    for (const l of bundle.leftOut) console.log(`left out ${l.kind}: ${l.label}`);
  } catch (error) {
    console.log(`refused: ${(error as { code?: string }).code ?? (error as Error).message}`);
  }
}
