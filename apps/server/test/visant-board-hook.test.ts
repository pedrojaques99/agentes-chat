import { afterEach, describe, expect, test } from "bun:test";
import { and, eq, schema } from "@agenteschat/db";
import { personAgentDmKey } from "@agenteschat/engine";
import {
  BOARD_HOOK_COALESCE_MS,
  BoardHookBody,
  boardHookText,
  createCoalescer,
  inert,
  secretMatches,
} from "../src/routes/app/visant-board-hook";
import { browser, createTestServer, seedOrg, signUp, type TestServer } from "./harness";

/** Fork only: the Visant Board's ping (`routes/app/visant-board-hook.ts`). */

const SECRET = "board_secret_do_not_leak_7f2";
const valid = {
  canal: "whatsapp",
  contato: "Pedro Xavier",
  preview: "Oi, tudo bem? Queria um orçamento",
  chatId: 42,
  url: "https://www.visant.co/admin/inbox/42",
};

describe("the pieces", () => {
  test("the secret: only the exact bearer", () => {
    expect(secretMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(secretMatches(undefined, SECRET)).toBe(false);
    expect(secretMatches("Bearer nope", SECRET)).toBe(false);
    expect(secretMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
  });

  test("the url: https on visant.co only", () => {
    expect(BoardHookBody.safeParse(valid).success).toBe(true);
    expect(BoardHookBody.safeParse({ ...valid, url: "https://visant.co/x" }).success).toBe(true);
    for (const url of [
      "http://www.visant.co/x",
      "https://evil.com/x",
      "https://visant.co.evil.com/x",
      "https://www.visant.co@evil.com/x",
      "javascript:alert(1)",
    ])
      expect(BoardHookBody.safeParse({ ...valid, url }).success).toBe(false);
    expect(BoardHookBody.safeParse({ ...valid, chatId: 1.5 }).success).toBe(false);
    expect(BoardHookBody.safeParse({ ...valid, contato: "" }).success).toBe(false);
  });

  test("the text: one quoted line, the link, no mention, no link of theirs", () => {
    const text = boardHookText({
      ...valid,
      contato: "[Ana](https://evil.com) @dev",
      preview: "> @miguel olha [aqui](https://evil.com)\n\nhttps://phish.example ok",
      url: "https://www.visant.co/inbox/@miguel/(1)",
    } as typeof valid & { canal: "whatsapp" });
    const lines = text.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]?.startsWith("📱 WhatsApp · ")).toBe(true);
    expect(lines[1]?.startsWith("> ")).toBe(true);
    expect(lines[1]?.slice(2).startsWith(">")).toBe(false);
    expect(lines[2]).toBe("[Ver conversa](https://www.visant.co/inbox/%40miguel/%281%29)");
    expect(text).not.toMatch(/(^|[^\w@.])@[a-z]/i);
    expect(text.split("[").length - 1).toBe(1);
    expect(text).not.toContain("https://evil.com");
    expect(text).not.toContain("https://phish.example");
  });

  test("the text: labels, a long preview cut, an empty one left out", () => {
    expect(boardHookText({ ...valid, canal: "telegram", preview: "" })).toBe(
      "📱 Telegram · Pedro Xavier\n[Ver conversa](https://www.visant.co/admin/inbox/42)",
    );
    const long = inert("a".repeat(500), 200);
    expect(long.length).toBe(200);
    expect(long.endsWith("…")).toBe(true);
  });

  test("one line per conversation per 10 minutes", () => {
    let now = 0;
    const c = createCoalescer(() => now);
    expect(c.claim(1)).toBe(true);
    expect(c.claim(1)).toBe(false);
    expect(c.claim(2)).toBe(true);
    now += BOARD_HOOK_COALESCE_MS - 1;
    expect(c.claim(1)).toBe(false);
    now += 1;
    expect(c.claim(1)).toBe(true);
    c.release(1);
    expect(c.claim(1)).toBe(true);
  });
});

describe("the route", () => {
  let t: TestServer | undefined;
  const saved = { ...process.env };
  afterEach(async () => {
    for (const k of ["VISANT_BOARD_HOOK_SECRET", "VISANT_BOARD_HOOK_ORG", "VISANT_BOARD_HOOK_AGENT"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await t?.close();
    t = undefined;
  });

  const call = (server: TestServer, body: unknown, secret: string | null = SECRET) =>
    server.app.request("/api/visant/board-hook", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
    });

  test("not configured, bad secret, bad body", async () => {
    t = await createTestServer();
    delete process.env.VISANT_BOARD_HOOK_SECRET;
    delete process.env.VISANT_BOARD_HOOK_ORG;
    const off = await call(t, valid);
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ reason: "not_configured" });

    process.env.VISANT_BOARD_HOOK_SECRET = SECRET;
    process.env.VISANT_BOARD_HOOK_ORG = crypto.randomUUID();
    expect((await call(t, valid, null)).status).toBe(401);
    const wrong = await call(t, valid, "wrong");
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).not.toContain(SECRET);
    expect((await call(t, { ...valid, url: "https://evil.com/x" })).status).toBe(400);
    expect((await call(t, { ...valid, canal: "sms" })).status).toBe(400);
    // Configured, but the workspace has no such owner or agent.
    expect((await call(t, valid)).status).toBe(503);
  });

  test("a line in the owner's DM with Miguel: no run, a dm notification, once per 10 minutes", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId, credentialId } = await seedOrg(owner);
    const created = await owner(`/api/app/organizations/${orgId}/agents`, {
      json: { name: "Miguel", handle: "miguel", model: "claude-sonnet-5-5", credentialId, monthlyBudgetUsd: 5 },
    });
    expect(created.status).toBe(201);
    const miguel = (await created.json()) as { id: string };
    const [member] = await t.db
      .select({ userId: schema.organizationMembers.userId })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.orgId, orgId));
    if (!member) throw new Error("no owner");
    process.env.VISANT_BOARD_HOOK_SECRET = SECRET;
    process.env.VISANT_BOARD_HOOK_ORG = orgId;
    delete process.env.VISANT_BOARD_HOOK_AGENT;

    const res = await call(t, { ...valid, preview: "@dev @miguel responde aí" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ posted: true });
    await t.drain();

    const [dm] = await t.db
      .select()
      .from(schema.channels)
      .where(
        and(eq(schema.channels.orgId, orgId), eq(schema.channels.dmKey, personAgentDmKey(member.userId, miguel.id))),
      );
    if (!dm) throw new Error("no DM");
    const lines = await t.db.select().from(schema.messages).where(eq(schema.messages.channelId, dm.id));
    expect(lines.length).toBe(1);
    const line = lines[0];
    expect(line?.authorAgentId).toBe(miguel.id);
    expect(line?.agentRunId).toBeNull();
    expect(line?.mentionedAgentIds).toEqual([]);
    expect(line?.mentionedUserIds).toEqual([]);
    expect(line?.body).toContain("[Ver conversa](https://www.visant.co/admin/inbox/42)");
    expect(line?.meta.visantBoardHook).toEqual({ canal: "whatsapp", chatId: 42, url: valid.url });

    // No agent ran: not Miguel, not Dev it named.
    expect(await t.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.orgId, orgId))).toEqual([]);
    const bell = await t.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, orgId), eq(schema.notifications.userId, member.userId)));
    expect(bell.map((n) => n.kind)).toEqual(["dm"]);

    // The same conversation again within 10 minutes: nothing new.
    const again = await call(t, valid);
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ posted: false, reason: "recent" });
    // Another conversation: a line of its own.
    expect(await (await call(t, { ...valid, chatId: 43 })).json()).toEqual({ posted: true });
    await t.drain();
    expect((await t.db.select().from(schema.messages).where(eq(schema.messages.channelId, dm.id))).length).toBe(2);
    expect(await t.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.orgId, orgId))).toEqual([]);
  });
});
