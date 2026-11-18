import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent } from "@testing-library/react";
import { createFakeApi, ENG_ID, ORG_ID, seedDm, seedState } from "./fake-api";
import { renderApp, settle } from "./render";

/* The "Mensagens diretas" part: with no direct conversation yet it is a plain title (no chevron, no toggle) and keeps
   its empty line; with one, it folds like the other parts. */

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

const nav = () => document.getElementById("app-nav") as HTMLElement;
/** The direct messages part, found by its title. */
const dmPart = () =>
  [...nav().querySelectorAll<HTMLElement>(".sidebar__section")].find(
    (s) => s.querySelector(".sidebar__label")?.textContent === "Mensagens diretas",
  );

const go = async (state: ReturnType<typeof seedState>) => {
  await renderApp(`/org/${ORG_ID}/c/${ENG_ID}`, { api: createFakeApi(state) });
  await settle(8);
};

describe("direct messages part", () => {
  test("no conversations yet: the title has no collapse toggle, and the empty line shows", async () => {
    await go(seedState());
    const part = dmPart();
    expect(part).toBeDefined();
    expect(part?.querySelector("button.sidebar__section-toggle")).toBeNull();
    expect(part?.querySelector(".sidebar__section-chevron")).toBeNull();
    expect(part?.querySelector(".sidebar__section-title")).not.toBeNull();
    expect(part?.dataset.open).toBe("true");
    expect(part?.querySelector(".sidebar__empty")?.textContent).toContain("aparecem aqui");
  });

  test("with a conversation: the title is a toggle again", async () => {
    const state = seedState();
    seedDm(state, { type: "person", id: "u-walter" });
    await go(state);
    const part = dmPart();
    expect(part).toBeDefined();
    const toggle = part?.querySelector<HTMLButtonElement>("button.sidebar__section-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(part?.querySelector(".sidebar__section-chevron")).not.toBeNull();
    await act(async () => fireEvent.click(toggle as HTMLButtonElement));
    await settle(3);
    expect(dmPart()?.querySelector("button.sidebar__section-toggle")?.getAttribute("aria-expanded")).toBe("false");
  });
});
