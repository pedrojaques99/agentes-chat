import { type ArtifactDeps, createFileArtifact } from "./artifacts";
import { pictureSize } from "./image-size";
import { fetchWebPicture, type WebPictureDeps } from "./live/web-pictures";
import { outboundRefusal } from "./outbound";
import type { ArtifactLink } from "./run-tools";
import type { ToolContext } from "./tools/types";

/**
 * Picture links in an agent's reply (ADR 0197 addendum 2026-11-19): the server downloads each one when the run ends
 * and attaches it to that reply as a picture file, as `generate_image`'s are, so people see the picture without any
 * app loading the outside address (ADR 0117, ADR 0091). The link stays in the text.
 */

export const PICTURE_LINK_LIMITS = {
  /** Links read from one reply, the first ones in order. */
  perReply: 8,
  /** Downloads at the same time. */
  atOnce: 3,
  /** For all of a reply's downloads: what isn't in by then is skipped, so the reply never waits long. */
  budgetMs: 30_000,
} as const;

/** What the ending needs: the Drive, how the server reaches the web (tests give their own) and its own origins. */
export interface PictureLinkDeps {
  artifacts: ArtifactDeps;
  web?: WebPictureDeps;
  /** This server's own addresses (`PUBLIC_URL`'s origin): a link there is already one of our files. */
  ownOrigins: readonly string[];
  log?: { info(message: string, data?: Record<string, unknown>): void };
}

/** The bare-URL shape of the chat's markdown (`INLINE` in packages/ui/src/markdown.ts): it never ends on punctuation. */
const URL_IN_TEXT = /https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/gi;
/** Fenced blocks and code spans: what is written there is code, not a picture to show. */
const CODE = /(```|~~~)[\s\S]*?(?:\1|$)|`[^`\n]+`/g;
const PICTURE_PATH = /\.(png|jpe?g|webp|gif)$/i;

/**
 * The distinct picture links in `text`, in order and at most `PICTURE_LINK_LIMITS.perReply`: bare, `[x](url)` and
 * `![x](url)` alike, whose path (query and hash aside) ends as a PNG, JPEG, WebP or GIF; none inside code, none on
 * `ownOrigins`.
 */
export function imageLinksOf(text: string, ownOrigins: readonly string[] = []): string[] {
  const own = new Set(ownOrigins.map((o) => o.toLowerCase()));
  const out: string[] = [];
  const outside = text.replace(CODE, (m) => " ".repeat(m.length));
  for (const m of outside.matchAll(URL_IN_TEXT)) {
    let url: URL;
    try {
      url = new URL(m[0]);
    } catch {
      continue;
    }
    if (own.has(url.origin.toLowerCase()) || !PICTURE_PATH.test(url.pathname)) continue;
    if (!out.includes(m[0])) out.push(m[0]);
    if (out.length >= PICTURE_LINK_LIMITS.perReply) break;
  }
  return out;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The link's file name, decoded, as a title (without its extension) and a name (with the type's): else "imagem". */
function namesOf(raw: string, contentType: string): { title: string; name: string } {
  let last = "";
  try {
    last = new URL(raw).pathname.split("/").at(-1) ?? "";
    last = decodeURIComponent(last);
  } catch {
    // A name that won't decode reads as it was written.
  }
  const base =
    last
      .replace(PICTURE_PATH, "")
      .replace(/\p{Cc}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "imagem";
  return { title: base, name: `${base}.${EXTENSIONS[contentType] ?? "png"}` };
}

/**
 * Downloads `urls` for the reply posted in `ctx`'s channel, in `threadId`, and stores each as a picture file of the
 * agent's: each checked first by the run's own outbound policy (`outboundRefusal`, ADR 0117), then fetched by the
 * public-address guard (`fetchWebPicture`). A link refused, failed, not a raster picture, over the workspace's storage
 * or past the budget is left as a link: nothing here fails the run or the reply. The files, in the links' order.
 */
export async function importPictureLinks(
  deps: PictureLinkDeps,
  ctx: ToolContext,
  threadId: string | null,
  urls: readonly string[],
): Promise<ArtifactLink[]> {
  const links = urls.slice(0, PICTURE_LINK_LIMITS.perReply);
  if (links.length === 0) return [];
  const budget = AbortSignal.timeout(PICTURE_LINK_LIMITS.budgetMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, budget]) : budget;
  const actor = { type: "agent" as const, agentId: ctx.agentId, channelId: ctx.channelId, threadId, runId: ctx.runId };
  const found: (ArtifactLink | null)[] = links.map(() => null);
  const one = async (url: string): Promise<ArtifactLink | null> => {
    const refusal = await outboundRefusal(ctx, url);
    if (refusal) {
      deps.log?.info("picture link refused", { runId: ctx.runId, code: refusal.data?.code });
      return null;
    }
    const picture = await fetchWebPicture(url, deps.web, signal);
    // Only what the chat draws as a picture: an SVG stays a link.
    if (!EXTENSIONS[picture.contentType]) return null;
    if (signal.aborted) return null;
    const names = namesOf(url, picture.contentType);
    const file = await createFileArtifact(deps.artifacts, actor, ctx.orgId, {
      ...names,
      bytes: picture.bytes,
      contentType: picture.contentType,
    });
    const content = file.content.kind === "file" ? file.content : null;
    return { id: file.id, version: file.version, title: file.title, ...pictureSize(content ?? {}) };
  };
  let next = 0;
  const worker = async () => {
    while (next < links.length && !signal.aborted) {
      const i = next++;
      try {
        found[i] = await one(links[i] as string);
      } catch (error) {
        deps.log?.info("picture link not attached", {
          runId: ctx.runId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PICTURE_LINK_LIMITS.atOnce, links.length) }, worker));
  return found.filter((f): f is ArtifactLink => f !== null);
}
