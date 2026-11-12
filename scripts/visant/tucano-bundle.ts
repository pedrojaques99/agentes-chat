// Visant's team from the Tucano desktop app into agentes.chat's own import format (`agenteschat.bundle`, read by
// packages/client/src/lib/import/agenteschat.ts): agents, #visant-team, their confirmed memories as notes, and the
// visant-* skills from ~/.claude/skills. Upload the file in Settings → Import. Nothing secret is read: Tucano keeps
// keys in another table, and the import scrubs anything that looks like one.
//
//   bun scripts/visant/tucano-bundle.ts [--db <tucano.db>] [--out agentes-chat-export.json]
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
};
const dbPath = arg("db", join(process.env.APPDATA ?? join(homedir(), ".config"), "Tucano", "tucano.db"));
const out = arg("out", "agentes-chat-export.json");
// The team that moves (the owner's pick); the rest of Tucano's agents stay there.
const TEAM = ["miguel", "rollo", "felix", "ageu", "torres", "norton", "darlan"];
const CHANNEL = "visant-team";
const SKILLS_DIR = join(homedir(), ".claude", "skills");

const db = new Database(dbPath, { readonly: true });
type Row = Record<string, string | number | null>;
const agents = db
  .query(`SELECT id, name, handle, role, instructions FROM agents WHERE archived = 0`)
  .all()
  .filter((a) => TEAM.includes(String((a as Row).handle))) as Row[];
const byId = new Map(agents.map((a) => [String(a.id), String(a.handle)]));

// Every visant-* skill goes to every agent of the team: in Tucano they were global (~/.claude/skills).
// Skill folders are often links (installed by a skills manager): stat follows them.
const skills = readdirSync(SKILLS_DIR)
  .filter(
    (name) => name.startsWith("visant-") && statSync(join(SKILLS_DIR, name), { throwIfNoEntry: false })?.isDirectory(),
  )
  .flatMap((name) => {
    try {
      return [{ key: name, markdown: readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8") }];
    } catch {
      return [];
    }
  });

const channel = db
  .query(`SELECT id, name, topic FROM conversations WHERE kind = 'channel' AND name = ?`)
  .get(CHANNEL) as Row | undefined;
const members = channel
  ? (db.query(`SELECT agent_id FROM members WHERE conversation_id = ?`).all(String(channel.id)) as Row[])
      .map((m) => byId.get(String(m.agent_id)))
      .filter((h): h is string => Boolean(h))
  : [];

// What Tucano remembers (confirmed, or still waiting for a look: it never asked), at most 50 per agent (the format's cap), each a short fact.
const notes = (
  db
    .query(
      `SELECT id, agent_id, text FROM memories WHERE state IN ('confirmed', 'pending') AND agent_id IS NOT NULL ORDER BY created_at DESC`,
    )
    .all() as Row[]
)
  .filter((m) => byId.has(String(m.agent_id)))
  .filter((m, _i, all) => all.filter((x) => x.agent_id === m.agent_id).indexOf(m) < 50)
  .map((m) => ({
    key: String(m.id),
    agent: byId.get(String(m.agent_id)) ?? null,
    kind: "fact",
    content: String(m.text),
  }));

const bundle = {
  format: "agenteschat.bundle",
  version: 1,
  source: { app: "tucano", ref: "visant-team", name: "Tucano · time Visant", files: [] },
  agents: agents.map((a) => ({
    key: String(a.handle),
    name: String(a.name),
    handle: String(a.handle),
    role: String(a.role ?? ""),
    instructions: String(a.instructions ?? ""),
    // Each one thinks with Claude Code on a computer, set after the import (docs/visant/PLANO-paridade.md).
    model: null,
    appearance: {},
    skills: skills.map((s) => s.key),
  })),
  skills,
  channels: channel
    ? [
        {
          key: CHANNEL,
          name: CHANNEL,
          topic: String(channel.topic ?? ""),
          agents: members.map((key) => ({ key, autoReply: true })),
        },
      ]
    : [],
  routines: [],
  notes,
  todo: [
    { kind: "connection", label: "Visant Labs (api.visantlabs.com/api/mcp)", agents: TEAM },
    { kind: "connection", label: "visant-board (visant.co/api/mcp)", agents: TEAM },
    { kind: "connection", label: "Linear", agents: TEAM },
  ],
  leftOut: [],
};
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(
  `${out}: ${bundle.agents.length} agents (${bundle.agents.map((a) => a.handle).join(", ")}), ${skills.length} skills, ` +
    `#${CHANNEL} with ${members.length}, ${notes.length} notes`,
);
