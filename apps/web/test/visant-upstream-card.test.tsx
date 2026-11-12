import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent } from "@testing-library/react";
import { UpstreamCard, type UpstreamSource, type UpstreamStatus } from "@/components/visant/UpstreamCard";
import { createFakeApi, seedState } from "./fake-api";
import { renderPage, screen, settle } from "./render";

afterEach(() => cleanup());

const WORKFLOW = "https://github.com/pedrojaques99/agentes-chat/actions/workflows/visant-sync-upstream.yml";
const commit = (n: number) => ({
  sha: `abc000${n}`,
  message: `Mudança ${n}`,
  author: "ana",
  date: new Date(Date.now() - n * 3_600_000).toISOString(),
  url: `https://github.com/agentes-chat/agentes-chat/commit/abc000${n}`,
});
const status = (over: Partial<UpstreamStatus> = {}): UpstreamStatus => ({
  ok: true,
  behind: 7,
  commits: [1, 2, 3, 4, 5].map(commit),
  compareUrl: "https://github.com/pedrojaques99/agentes-chat/compare/visant/build...agentes-chat:agentes-chat:main",
  workflowUrl: WORKFLOW,
  canTrigger: true,
  checkedAt: new Date().toISOString(),
  ...over,
});

function fakeSource(answer: () => Promise<UpstreamStatus>) {
  const syncs: string[] = [];
  const source: UpstreamSource = {
    status: () => answer(),
    sync: async (orgId) => {
      syncs.push(orgId);
      return { started: true, runsUrl: WORKFLOW };
    },
  };
  return { source, syncs };
}

const show = async (source: UpstreamSource, role: "owner" | "member" = "owner") => {
  const state = seedState();
  if (state.me?.organizations[0]) state.me.organizations[0].role = role;
  await renderPage(<UpstreamCard source={source} />, { api: createFakeApi(state), org: true });
  await settle(4);
};

describe("Settings › Workspace: the fork's upstream card", () => {
  test("behind, with a token: the count, the newest five, Atualizar starts the sync", async () => {
    const { source, syncs } = fakeSource(async () => status());
    await show(source);
    expect(screen().getByText("O projeto original tem 7 mudanças novas")).toBeTruthy();
    for (const n of [1, 2, 3, 4, 5]) expect(screen().getByText(`Mudança ${n}`)).toBeTruthy();
    expect(screen().getByRole("link", { name: "Abrir abc0001 no GitHub" }).getAttribute("href")).toContain("abc0001");
    expect(screen().getByText("e mais 2")).toBeTruthy();
    expect(screen().getByText("Publicar em produção continua manual.")).toBeTruthy();
    await act(async () => fireEvent.click(screen().getByRole("button", { name: "Atualizar" })));
    await settle(4);
    expect(syncs.length).toBe(1);
    expect(screen().getAllByText("Sincronização iniciada").length).toBeGreaterThan(0);
    expect(
      screen()
        .getAllByRole("link", { name: "Ver no GitHub" })
        .some((a) => a.getAttribute("href") === WORKFLOW),
    ).toBe(true);
  });

  test("behind, without a token: Atualizar opens the workflow on GitHub, with a hint", async () => {
    const { source } = fakeSource(async () => status({ canTrigger: false }));
    await show(source);
    const link = screen().getByRole("link", { name: "Atualizar" });
    expect(link.getAttribute("href")).toBe(WORKFLOW);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen().queryByRole("button", { name: "Atualizar" })).toBeNull();
    expect(screen().getByText("Abre o GitHub: lá você roda a sincronização.")).toBeTruthy();
  });

  test("up to date: one line, no button", async () => {
    const { source } = fakeSource(async () => status({ behind: 0, commits: [] }));
    await show(source);
    expect(screen().getByText("Em dia com o projeto original")).toBeTruthy();
    expect(screen().queryByText("Atualizar")).toBeNull();
  });

  test("GitHub unreachable: a quiet line, never a 0", async () => {
    for (const answer of [
      async () => status({ ok: false, behind: null, commits: [] }),
      async (): Promise<UpstreamStatus> => {
        throw new Error("network");
      },
    ]) {
      const { source } = fakeSource(answer);
      await show(source);
      expect(screen().getByText("Não deu para verificar agora")).toBeTruthy();
      expect(screen().queryByText("Em dia com o projeto original")).toBeNull();
      expect(screen().queryByText("Atualizar")).toBeNull();
      cleanup();
    }
  });

  test("not the owner: nothing", async () => {
    const { source } = fakeSource(async () => status());
    await show(source, "member");
    expect(screen().queryByText("Projeto original")).toBeNull();
  });
});
