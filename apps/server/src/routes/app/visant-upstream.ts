/**
 * Fork only (pedrojaques99/agentes-chat): how far visant/build is behind the original project's main, and a button
 * that starts `.github/workflows/visant-sync-upstream.yml` (the same merge that runs twice a day). Deploying stays a
 * manual step on the VPS. Lives in its own file, registered with one line in `app.ts`, so upstream merges don't touch it.
 *
 * The settings are read from `process.env` here, not from `@agenteschat/config`: adding them to the typed config would
 * mean editing upstream files on every merge.
 *   VISANT_FORK_REPO      default pedrojaques99/agentes-chat
 *   VISANT_FORK_BRANCH    default visant/build
 *   VISANT_UPSTREAM_REPO  default agentes-chat/agentes-chat (its `main`)
 *   GITHUB_SYNC_TOKEN     a token that may run the fork's workflows (Actions: write). Absent: the button opens the
 *                         workflow's page on GitHub instead. Never logged, never returned.
 */
import { ForbiddenError, requireActiveMembership } from "@agenteschat/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { apiError, errorResponse } from "../../http/errors";
import { type AppDeps, createAppRouter, errors, json, OrgParams, requireSession, security } from "./context";

const tags = ["Fork"];
const WORKFLOW = "visant-sync-upstream.yml";
/** GitHub answers 60 unauthenticated requests an hour: one look every 10 minutes at most. */
export const UPSTREAM_CACHE_MS = 10 * 60_000;
const NEWEST = 5;
const USER_AGENT = "agentes-fork-sync";
const SYNCS = { limit: 5, windowMs: 60_000 };

type Env = Record<string, string | undefined>;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function upstreamSettings(env: Env = process.env) {
  const fork = env.VISANT_FORK_REPO?.trim() || "pedrojaques99/agentes-chat";
  const branch = env.VISANT_FORK_BRANCH?.trim() || "visant/build";
  const upstream = env.VISANT_UPSTREAM_REPO?.trim() || "agentes-chat/agentes-chat";
  const token = env.GITHUB_SYNC_TOKEN?.trim() || undefined;
  return {
    fork,
    branch,
    upstream,
    token,
    workflowUrl: `https://github.com/${fork}/actions/workflows/${WORKFLOW}`,
  };
}

const Commit = z.object({
  sha: z.string().openapi({ description: "The first 7 characters." }),
  message: z.string().openapi({ description: "The message's first line." }),
  author: z.string(),
  date: z.string().nullable(),
  url: z.string(),
});
export type UpstreamCommit = z.infer<typeof Commit>;

const UpstreamStatus = z
  .object({
    ok: z.boolean().openapi({ description: "False: GitHub couldn't be asked now (network, rate limit). Not a 0." }),
    behind: z
      .number()
      .nullable()
      .openapi({ description: "Commits upstream's main has that the fork's branch doesn't." }),
    commits: z.array(Commit).openapi({ description: "The newest few of them, newest first." }),
    compareUrl: z.string(),
    workflowUrl: z.string().openapi({ description: "The sync workflow's page, where its runs are." }),
    canTrigger: z.boolean().openapi({ description: "`GITHUB_SYNC_TOKEN` is set: the sync can start from here." }),
    checkedAt: z.string(),
  })
  .openapi("VisantUpstreamStatus");
export type UpstreamStatusView = z.infer<typeof UpstreamStatus>;

const SyncStarted = z.object({ started: z.literal(true), runsUrl: z.string() }).openapi("VisantUpstreamSync");

interface CompareCommit {
  sha: string;
  html_url: string;
  author: { login?: string } | null;
  commit: { message: string; author: { name?: string; date?: string } | null };
}

/** The status and the sync, with `fetch`, the environment and the clock passed in (tests). */
export function createUpstreamSync(options: { fetch?: Fetch; env?: Env; now?: () => number } = {}) {
  const send: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = options.now ?? Date.now;
  let cached: { at: number; key: string; view: Omit<UpstreamStatusView, "canTrigger" | "workflowUrl"> } | null = null;

  async function status(): Promise<UpstreamStatusView> {
    const s = upstreamSettings(options.env);
    const [owner, repo] = s.upstream.split("/");
    const key = `${s.fork}:${s.branch}:${s.upstream}`;
    const base = { canTrigger: !!s.token, workflowUrl: s.workflowUrl };
    if (cached && cached.key === key && now() - cached.at < UPSTREAM_CACHE_MS) return { ...cached.view, ...base };
    const compareUrl = `https://github.com/${s.fork}/compare/${s.branch}...${owner}:${repo}:main`;
    const api = `https://api.github.com/repos/${s.fork}/compare/${s.branch}...${owner}:${repo}:main`;
    const checkedAt = new Date(now()).toISOString();
    try {
      const res = await send(api, {
        headers: { accept: "application/vnd.github+json", "user-agent": USER_AGENT },
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const data = (await res.json()) as { ahead_by: number; commits: CompareCommit[] };
      const commits = [...(data.commits ?? [])]
        .reverse()
        .slice(0, NEWEST)
        .map((c) => ({
          sha: c.sha.slice(0, 7),
          message: (c.commit.message.split("\n")[0] ?? "").trim(),
          author: c.author?.login ?? c.commit.author?.name ?? "",
          date: c.commit.author?.date ?? null,
          url: c.html_url,
        }));
      const view = { ok: true, behind: data.ahead_by, commits, compareUrl, checkedAt };
      cached = { at: now(), key, view };
      return { ...view, ...base };
    } catch {
      // Not cached: the next look tries again.
      return { ok: false, behind: null, commits: [], compareUrl, checkedAt, ...base };
    }
  }

  /** Starts the workflow. False: no token, or GitHub refused. */
  async function sync(): Promise<{ started: boolean; runsUrl: string; reason?: "no_token" | "refused" }> {
    const s = upstreamSettings(options.env);
    const runsUrl = s.workflowUrl;
    if (!s.token) return { started: false, runsUrl, reason: "no_token" };
    try {
      const res = await send(`https://api.github.com/repos/${s.fork}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${s.token}`,
          "content-type": "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({ ref: s.branch }),
      });
      if (!res.ok) return { started: false, runsUrl, reason: "refused" };
    } catch {
      return { started: false, runsUrl, reason: "refused" };
    }
    cached = null;
    return { started: true, runsUrl };
  }

  return { status, sync };
}

const shared = createUpstreamSync();

/** Owner of the workspace only: the card in Settings › Workspace. */
export function visantUpstreamRoutes(deps: AppDeps, upstream = shared) {
  const { db } = deps;
  const app = createAppRouter(deps);
  app.use("/organizations/*", requireSession(deps.auth));

  const ownerOnly = async (userId: string, orgId: string) => {
    const membership = await requireActiveMembership(db, userId, orgId);
    if (membership.role !== "owner") throw new ForbiddenError();
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/visant/upstream",
      tags,
      security,
      summary: "How many commits the original project has that this fork's branch doesn't, the newest first",
      description: "Workspace owner only. Asked of GitHub at most every 10 minutes.",
      request: { params: OrgParams },
      responses: { 200: json(UpstreamStatus), ...errors },
    }),
    async (c) => {
      await ownerOnly(c.get("user").id, c.req.valid("param").orgId);
      return c.json(await upstream.status(), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/visant/upstream/sync",
      tags,
      security,
      summary: "Start the fork's upstream sync workflow on GitHub",
      description:
        "Workspace owner only. 409 `sync_no_token` without `GITHUB_SYNC_TOKEN`, 502 `sync_failed` when GitHub refuses.",
      request: { params: OrgParams },
      responses: {
        200: json(SyncStarted),
        ...errors,
        429: errorResponse("Too many tries (`rate_limited`)"),
        502: errorResponse("GitHub refused (`sync_failed`)"),
      },
    }),
    async (c) => {
      const user = c.get("user");
      await ownerOnly(user.id, c.req.valid("param").orgId);
      if (!(await deps.adapters.rateLimiter.consume(`visant-sync:${user.id}`, SYNCS)).allowed)
        return apiError(c, 429, "rate_limited", "Too many tries. Wait a minute.");
      const result = await upstream.sync();
      if (result.started) return c.json({ started: true as const, runsUrl: result.runsUrl }, 200);
      if (result.reason === "no_token") return apiError(c, 409, "sync_no_token", "GITHUB_SYNC_TOKEN is not set.");
      return apiError(c, 502, "sync_failed", "GitHub didn't start the sync.");
    },
  );

  return app;
}
