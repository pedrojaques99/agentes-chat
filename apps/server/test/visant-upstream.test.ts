import { afterEach, describe, expect, test } from "bun:test";
import { createUpstreamSync, UPSTREAM_CACHE_MS } from "../src/routes/app/visant-upstream";
import { browser, createTestServer, joinByInvitation, signUp, type TestServer } from "./harness";

/** Fork only: the upstream card's route (`routes/app/visant-upstream.ts`). */

const TOKEN = "ghp_do_not_leak_51c3";
const compare = (behind: number) => ({
  ahead_by: behind,
  commits: Array.from({ length: behind }, (_, i) => ({
    sha: `${i}`.padStart(40, "a"),
    html_url: `https://github.com/agentes-chat/agentes-chat/commit/${i}`,
    author: i % 2 ? null : { login: "ana" },
    commit: { message: `Change ${i}\n\nbody`, author: { name: "Ana Lima", date: `2026-11-0${(i % 9) + 1}T00:00:00Z` } },
  })),
});

/** A fake GitHub: answers `answers` in turn ("down": throws), every call recorded. */
function fakeGitHub(answers: (Response | "down")[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift() ?? Response.json(compare(0));
    if (next === "down") throw new TypeError("fetch failed");
    return next;
  };
  return { fetch, calls };
}

describe("status and sync", () => {
  test("the count, the newest five newest first, the compare call with its User-Agent and no token", async () => {
    const gh = fakeGitHub([Response.json(compare(7))]);
    const up = createUpstreamSync({ fetch: gh.fetch, env: { GITHUB_SYNC_TOKEN: TOKEN } });
    const view = await up.status();
    expect(view.ok).toBe(true);
    expect(view.behind).toBe(7);
    expect(view.canTrigger).toBe(true);
    expect(view.commits.map((c) => c.message)).toEqual(["Change 6", "Change 5", "Change 4", "Change 3", "Change 2"]);
    expect(view.commits[0]).toMatchObject({ sha: "aaaaaaa", author: "ana" });
    expect(view.commits[1]?.author).toBe("Ana Lima");
    expect(gh.calls[0]?.url).toBe(
      "https://api.github.com/repos/pedrojaques99/agentes-chat/compare/visant/build...agentes-chat:agentes-chat:main",
    );
    const headers = (gh.calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers["user-agent"]).toBe("agentes-fork-sync");
    expect(headers.authorization).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(TOKEN);
  });

  test("cached for 10 minutes; a failure isn't a 0 and isn't cached", async () => {
    let now = 0;
    const gh = fakeGitHub([new Response("rate limited", { status: 403 }), "down", Response.json(compare(2))]);
    const up = createUpstreamSync({ fetch: gh.fetch, env: {}, now: () => now });
    expect(await up.status()).toMatchObject({ ok: false, behind: null, commits: [], canTrigger: false });
    expect((await up.status()).ok).toBe(false);
    expect((await up.status()).behind).toBe(2);
    now += UPSTREAM_CACHE_MS - 1;
    expect((await up.status()).behind).toBe(2);
    expect(gh.calls.length).toBe(3);
    now += 1;
    expect((await up.status()).behind).toBe(0);
    expect(gh.calls.length).toBe(4);
  });

  test("sync dispatches the workflow on the fork's branch with the token, then looks again", async () => {
    const gh = fakeGitHub([Response.json(compare(3)), new Response(null, { status: 204 }), Response.json(compare(0))]);
    const up = createUpstreamSync({ fetch: gh.fetch, env: { GITHUB_SYNC_TOKEN: TOKEN } });
    await up.status();
    const result = await up.sync();
    expect(result).toEqual({
      started: true,
      runsUrl: "https://github.com/pedrojaques99/agentes-chat/actions/workflows/visant-sync-upstream.yml",
    });
    const call = gh.calls[1];
    if (!call) throw new Error("no dispatch");
    expect(call.url).toBe(
      "https://api.github.com/repos/pedrojaques99/agentes-chat/actions/workflows/visant-sync-upstream.yml/dispatches",
    );
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(String(call.init?.body))).toEqual({ ref: "visant/build" });
    expect((call.init?.headers as Record<string, string> | undefined)?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect((await up.status()).behind).toBe(0);
  });

  test("no token: nothing sent; GitHub refusing: not started", async () => {
    const none = fakeGitHub([]);
    expect(await createUpstreamSync({ fetch: none.fetch, env: {} }).sync()).toMatchObject({
      started: false,
      reason: "no_token",
    });
    expect(none.calls.length).toBe(0);
    const refused = fakeGitHub([new Response("{}", { status: 404 })]);
    expect(await createUpstreamSync({ fetch: refused.fetch, env: { GITHUB_SYNC_TOKEN: TOKEN } }).sync()).toMatchObject({
      started: false,
      reason: "refused",
    });
  });
});

describe("the route", () => {
  let t: TestServer | undefined;
  const realFetch = globalThis.fetch;
  afterEach(async () => {
    globalThis.fetch = realFetch;
    await t?.close();
    t = undefined;
  });

  test("the workspace's owner only", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const created = (await (await owner("/api/app/organizations", { json: { name: "Acme" } })).json()) as {
      organization: { id: string };
    };
    const orgId = created.organization.id;
    const member = await joinByInvitation(t, owner, orgId, "member@example.com");
    globalThis.fetch = (async () => Response.json(compare(4))) as unknown as typeof fetch;

    const path = `/api/app/organizations/${orgId}/visant/upstream`;
    expect((await member(path)).status).toBe(403);
    expect((await member(`${path}/sync`, { json: {} })).status).toBe(403);
    const res = await owner(path);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, behind: 4 });
    // No GITHUB_SYNC_TOKEN in the test's environment.
    if (!process.env.GITHUB_SYNC_TOKEN) expect((await owner(`${path}/sync`, { json: {} })).status).toBe(409);
  });
});
