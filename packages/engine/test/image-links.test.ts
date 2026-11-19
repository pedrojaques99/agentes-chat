import { afterEach, describe, expect, test } from "bun:test";
import { MACHINE_PROTOCOL_VERSION } from "@agenteschat/adapters";
import { and, desc, eq, schema } from "@agenteschat/db";
import { fakeImagePng } from "@agenteschat/providers/testing";
import {
  type Brain,
  createJobHandlers,
  drainOutbox,
  imageLinksOf,
  isConfidential,
  type MachineStatus,
  markThreadConfidential,
  PICTURE_LINK_LIMITS,
  postPersonMessage,
} from "../src";
import { type Fixture, setup } from "./fixtures";
import { pairMachine } from "./machine-fixtures";

// Picture links in an agent's reply come in as picture files on it (ADR 0197 addendum 2026-11-19): downloaded by the
// server under the run's outbound policy, never shown from the outside address.

const OWN = "https://agentes.example.com";

describe("imageLinksOf", () => {
  test("bare links and Markdown links and images whose path ends as a picture, in order, each once", () => {
    const text = [
      "1. Cena 3 alinhada (dia): https://pub-abc.r2.dev/cenas/Cena%203.png.",
      "2. [noite](https://cdn.example.com/n/noite.JPG?w=800#top) e ![x](https://cdn.example.com/a.webp)",
      "De novo: https://pub-abc.r2.dev/cenas/Cena%203.png, e um gif http://gifs.example.com/x.gif!",
    ].join("\n");
    expect(imageLinksOf(text)).toEqual([
      "https://pub-abc.r2.dev/cenas/Cena%203.png",
      "https://cdn.example.com/n/noite.JPG?w=800#top",
      "https://cdn.example.com/a.webp",
      "http://gifs.example.com/x.gif",
    ]);
  });

  test("no page, no code, no address of this server's own", () => {
    const text = [
      "A página: https://example.com/galeria e https://example.com/foto.png.html",
      "Em código: `https://cdn.example.com/code.png`",
      "```\nhttps://cdn.example.com/block.png\n```",
      `Nosso: ${OWN}/api/app/files/1.png`,
      "Com consulta: https://example.com/view?file=a.png",
    ].join("\n");
    expect(imageLinksOf(text, [OWN])).toEqual([]);
  });

  test("at most the first links of a reply", () => {
    const text = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.png`).join(" ");
    const got = imageLinksOf(text);
    expect(got).toHaveLength(PICTURE_LINK_LIMITS.perReply);
    expect(got[0]).toBe("https://cdn.example.com/0.png");
  });
});

let f: Fixture | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});

const PNG = fakeImagePng("farol", "16:9");

/** A fake web: pictures by address, a 500 for `/broken`, and every address asked. */
function fakeWeb() {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    if (url.includes("/broken")) return new Response("down", { status: 500 });
    return new Response(PNG as Uint8Array<ArrayBuffer>, { headers: { "content-type": "image/png" } });
  };
  return { asked, deps: { fetch, resolveHost: async () => ["93.184.216.34"] } };
}

/** Claude Code on a paired computer: its turn ends with `text`, as the runner says it. */
async function onComputer(fx: Fixture, text: string) {
  const paired = await pairMachine({ db: fx.db, pubsub: fx.pubsub }, fx.owner.id, fx.org.id, {
    name: "MacBook",
    hostname: "mac",
    os: "darwin",
    arch: "arm64",
    version: "0.8.0",
    protocol: MACHINE_PROTOCOL_VERSION,
    workspace: "/Users/w/agentes",
    exec: true,
  });
  await fx.db
    .update(schema.agents)
    .set({ machineId: paired.machineId, brain: "claude_code" })
    .where(eq(schema.agents.id, fx.agent.id));
  const brain: Brain = {
    kind: "claude_code",
    async *run() {
      yield { type: "done", text };
    },
  };
  const status = async (id: string): Promise<MachineStatus> => ({
    id,
    orgId: fx.org.id,
    name: "MacBook",
    online: true,
    execAllowed: true,
    os: "darwin",
    protocol: 8,
    executors: { claude: { version: "2.1.300", loggedIn: true }, detectedAt: new Date().toISOString() },
  });
  return { brains: { claude_code: () => brain }, machines: { status } };
}

async function replyWith(text: string, options: { confidential?: boolean; computer?: boolean } = {}) {
  const fx = await setup({ reply: () => ({ chunks: [text] }) });
  f = fx;
  const web = fakeWeb();
  const handlers = createJobHandlers({
    ...fx.jobDeps,
    ...(options.computer ? await onComputer(fx, text) : {}),
    pictureLinks: { artifacts: fx.artifactDeps, web: web.deps, ownOrigins: [OWN] },
  });
  const say = (body: string, threadId?: string) =>
    postPersonMessage({ db: fx.db, pubsub: fx.pubsub }, fx.owner.id, fx.org.id, fx.general.id, { body, threadId });
  if (options.confidential) {
    const root = await say("O caso do cliente");
    await markThreadConfidential(fx.db, { orgId: fx.org.id, channelId: fx.general.id, rootId: root.id });
    await say("@dev manda as cenas", root.id);
  } else {
    await say("@dev manda as cenas");
  }
  await drainOutbox(fx.db, handlers);
  const [reply] = await fx.db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.orgId, fx.org.id), eq(schema.messages.authorType, "agent")))
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);
  const files = await fx.db.select().from(schema.artifacts).where(eq(schema.artifacts.orgId, fx.org.id));
  return { reply, web, files };
}

const artifactsOf = (meta: unknown) =>
  ((meta as { artifacts?: { id: string; title: string; width?: number; height?: number }[] } | null)?.artifacts ??
    []) as { id: string; title: string; width?: number; height?: number }[];

describe("a reply's picture links", () => {
  test("each picture comes in as a picture file on that reply, the links staying in its text", async () => {
    const text =
      "1. Cena 3 alinhada (dia): https://pub-abc.r2.dev/cenas/Cena%203%20dia.png\n2. Noite: [aqui](https://cdn.example.com/noite.jpg)";
    const { reply, web, files } = await replyWith(text);
    expect(reply?.body).toContain("https://pub-abc.r2.dev/cenas/Cena%203%20dia.png");
    expect(web.asked).toEqual(["https://pub-abc.r2.dev/cenas/Cena%203%20dia.png", "https://cdn.example.com/noite.jpg"]);
    const cards = artifactsOf(reply?.meta);
    expect(cards.map((c) => c.title)).toEqual(["Cena 3 dia", "noite"]);
    for (const c of cards) expect(c).toMatchObject({ width: 96, height: 54 });
    expect(files.map((a) => a.kind)).toEqual(["file", "file"]);
    expect(files.every((a) => a.channelId === reply?.channelId)).toBe(true);
    // None of it is the agent's tool calls.
    const steps = await (f as Fixture).db
      .select()
      .from(schema.agentRunSteps)
      .where(eq(schema.agentRunSteps.kind, "tool_call"));
    expect(steps).toHaveLength(0);
  });

  test("a computer brain's reply gets them too", async () => {
    const { reply, web } = await replyWith("Pronto: https://pub-abc.r2.dev/farol.png", { computer: true });
    expect(reply?.body).toContain("https://pub-abc.r2.dev/farol.png");
    expect(web.asked).toEqual(["https://pub-abc.r2.dev/farol.png"]);
    expect(artifactsOf(reply?.meta).map((c) => c.title)).toEqual(["farol"]);
    expect((f as Fixture).provider.calls).toHaveLength(0);
  });

  test("a page's link, a link in code and one of this server's own bring nothing", async () => {
    const { reply, web, files } = await replyWith(
      `A galeria: https://example.com/galeria, o código \`https://cdn.example.com/x.png\` e ${OWN}/f/1.png`,
    );
    expect(reply?.body).toContain("galeria");
    expect(web.asked).toEqual([]);
    expect(artifactsOf(reply?.meta)).toEqual([]);
    expect(files).toEqual([]);
  });

  test("a link the outbound policy refuses and a download that fails are skipped, and the reply still posts", async () => {
    const { reply, web } = await replyWith(
      "Três: https://cdn.example.com/a.png?k=sk-abcdefghijklmnopqrstuv https://cdn.example.com/broken.png https://cdn.example.com/ok.png",
    );
    expect(reply?.body).toStartWith("Três:");
    // The refused one is never asked for.
    expect(web.asked).toEqual(["https://cdn.example.com/broken.png", "https://cdn.example.com/ok.png"]);
    expect(artifactsOf(reply?.meta).map((c) => c.title)).toEqual(["ok"]);
  });

  test("a confidential run imports nothing", async () => {
    const { reply, web, files } = await replyWith("A cena: https://cdn.example.com/cena.png", { confidential: true });
    // Its reply is the thread's, sealed (ADR 0190).
    expect(isConfidential(reply?.meta ?? null)).toBe(true);
    expect(web.asked).toEqual([]);
    expect(artifactsOf(reply?.meta)).toEqual([]);
    expect(files).toEqual([]);
  });
});
