/**
 * Fork only (pedrojaques99/agentes-chat): the Visant Board's zero-token signal. When the board's WhatsApp, Telegram or
 * Discord bot receives a message, the board calls `POST /api/visant/board-hook` and the agent (Miguel by default) posts
 * one line in the workspace owner's DM with it, linking to the conversation in the board's inbox. That line is the
 * owner's usual DM notification (the bell and the push). No model is asked, no run starts: the line is written the way
 * `send_dm` writes one (`insertMessage` + `notifications.message`), with no run behind it, so `message.posted` routes it
 * to nobody (a DM routes agents' lines to no router, and a line with no run gets no sticker judgment) and it mentions
 * nobody (`@` in the board's text never reaches the message).
 * Lives in its own file, registered with one line in `app.ts`, so upstream merges don't touch it.
 *
 * The settings are read from `process.env` here, not from `@agenteschat/config`: adding them to the typed config would
 * mean editing upstream files on every merge.
 *   VISANT_BOARD_HOOK_SECRET  the bearer the board sends. Absent: 503 `not_configured`. Never logged, never returned.
 *   VISANT_BOARD_HOOK_ORG     the workspace's id. Absent: 503 `not_configured`.
 *   VISANT_BOARD_HOOK_AGENT   the agent's handle, default `miguel`.
 */
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, schema } from "@agenteschat/db";
import { enqueue, insertMessage, messageView, openPersonAgentDm, publishMessageCreated } from "@agenteschat/engine";
import { type OpenAPIHono, z } from "@hono/zod-openapi";
import { apiError } from "../../http/errors";
import type { AppDeps } from "./context";

type Env = Record<string, string | undefined>;

/** One line per conversation of the board at most this often: a burst of messages is one ping. */
export const BOARD_HOOK_COALESCE_MS = 10 * 60_000;
/** Every call, whoever's conversation: the board never needs more. */
const CALLS = { limit: 60, windowMs: 60_000 };
const PREVIEW_MAX = 200;
const ALLOWED_HOSTS = new Set(["www.visant.co", "visant.co"]);
const LABELS = { whatsapp: "WhatsApp", telegram: "Telegram", discord: "Discord" } as const;

export function boardHookSettings(env: Env = process.env) {
  return {
    secret: env.VISANT_BOARD_HOOK_SECRET?.trim() || undefined,
    orgId: env.VISANT_BOARD_HOOK_ORG?.trim() || undefined,
    handle: (env.VISANT_BOARD_HOOK_AGENT?.trim() || "miguel").replace(/^@/, "").toLowerCase(),
  };
}

/** Only the board's own pages: a leaked secret can't post a link anywhere else. */
const BoardUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "url must be https on visant.co");

export const BoardHookBody = z.object({
  canal: z.enum(["whatsapp", "telegram", "discord"]),
  contato: z.string().trim().min(1).max(120),
  preview: z.string().max(280),
  chatId: z.number().int(),
  url: BoardUrl,
  at: z.string().datetime({ offset: true }).optional(),
});
export type BoardHookInput = z.infer<typeof BoardHookBody>;

/** Equal-length buffers, compared in constant time. */
export function secretMatches(header: string | undefined, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "").trim() ?? "");
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Someone else's words, made inert on one line: no Markdown link (`[`, `]`), no wiki link, no quote of its own (`>`),
 * no autolink (`://` gets a zero-width space), no `@` that would mention (and wake) an agent or a person.
 */
export function inert(text: string, max: number): string {
  const line = text
    .replace(/[[\]]/g, "")
    .replace(/:\/\//g, ":/​/")
    .replace(/@/g, "＠")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:>\s*)+/, "")
    .trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** The link, with what could close the Markdown link early or read as a mention (`/@x`) percent-encoded. */
const safeHref = (url: string) => new URL(url).href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/@/g, "%40");

/** The line in the owner's DM (pt-BR: the board's people read Portuguese). */
export function boardHookText(input: Pick<BoardHookInput, "canal" | "contato" | "preview" | "url">): string {
  const preview = inert(input.preview, PREVIEW_MAX);
  return [
    `📱 ${LABELS[input.canal]} · ${inert(input.contato, 120)}`,
    ...(preview ? [`> ${preview}`] : []),
    `[Ver conversa](${safeHref(input.url)})`,
  ].join("\n");
}

/** At most one line per conversation per `BOARD_HOOK_COALESCE_MS` (this process's memory; a restart forgets it). */
export function createCoalescer(now: () => number = Date.now, windowMs = BOARD_HOOK_COALESCE_MS) {
  const last = new Map<number, number>();
  return {
    /** True: this call may post (and holds the slot). False: one went out recently. */
    claim(chatId: number) {
      const t = now();
      for (const [id, at] of last) if (t - at >= windowMs) last.delete(id);
      if (last.has(chatId)) return false;
      last.set(chatId, t);
      return true;
    },
    /** The post failed: the next call may try again. */
    release(chatId: number) {
      last.delete(chatId);
    },
  };
}

/** The org's owner (the oldest when several), its active agent by handle, and the DM between them: the line's place. */
async function postLine(deps: AppDeps, settings: { orgId: string; handle: string }, input: BoardHookInput) {
  const { db } = deps;
  const { organizationMembers, agents } = schema;
  const [owner] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, settings.orgId), eq(organizationMembers.role, "owner")))
    .orderBy(asc(organizationMembers.createdAt))
    .limit(1);
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, settings.orgId), eq(agents.handle, settings.handle), isNull(agents.archivedAt)));
  if (!owner || !agent) return null;
  const message = await db.transaction(async (tx) => {
    const dm = await openPersonAgentDm(tx, settings.orgId, owner.userId, agent.id);
    const written = await insertMessage(tx, {
      orgId: settings.orgId,
      channelId: dm.id,
      threadId: null,
      // A line no run wrote, a root of its own: it wakes nobody.
      author: { type: "agent", agentId: agent.id, runId: null, hop: 0, stretchId: null },
      body: boardHookText(input),
      meta: {
        // As `send_dm`: started by the agent for the person, so they are notified (an agent's reply isn't).
        agentDm: { via: "visant-board" },
        visantBoardHook: { canal: input.canal, chatId: input.chatId, url: input.url },
      },
    });
    // `insertMessage` queues notifications only for mentions, threads and runs: this line has none of them.
    await enqueue(tx, {
      orgId: settings.orgId,
      kind: "notifications.message",
      payload: { messageId: written.id },
      dedupeKey: `notifications.message:${written.id}`,
      maxAttempts: 4,
    });
    return written;
  });
  await publishMessageCreated(deps.adapters.pubsub, messageView(message));
  deps.wakeWorkers?.();
  return message;
}

/** Public, no session: the board's bearer is the credential. */
export function registerVisantBoardHook(
  api: OpenAPIHono,
  deps: AppDeps,
  options: { env?: Env; coalescer?: ReturnType<typeof createCoalescer> } = {},
) {
  const coalescer = options.coalescer ?? createCoalescer();
  api.post("/visant/board-hook", async (c) => {
    const settings = boardHookSettings(options.env);
    if (!settings.secret || !settings.orgId) return c.json({ reason: "not_configured" }, 503);
    if (!secretMatches(c.req.header("authorization"), settings.secret))
      return apiError(c, 401, "unauthorized", "Bad or missing secret.");
    if (!(await deps.adapters.rateLimiter.consume("visant-board-hook", CALLS)).allowed) {
      c.header("retry-after", "60");
      return apiError(c, 429, "rate_limited", "Too many calls. Try again in a minute.");
    }
    const parsed = BoardHookBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body.");
    const input = parsed.data;
    if (!coalescer.claim(input.chatId)) return c.json({ posted: false, reason: "recent" }, 202);
    try {
      const message = await postLine(deps, { orgId: settings.orgId, handle: settings.handle }, input);
      if (!message) {
        coalescer.release(input.chatId);
        deps.log?.warn("visant board hook: no owner or agent", { orgId: settings.orgId, agent: settings.handle });
        return c.json({ reason: "not_configured" }, 503);
      }
      // Never the preview or the contact: someone else's words.
      deps.log?.info("visant board hook posted", { canal: input.canal, chatId: input.chatId, messageId: message.id });
      return c.json({ posted: true }, 202);
    } catch (error) {
      coalescer.release(input.chatId);
      throw error;
    }
  });
}
