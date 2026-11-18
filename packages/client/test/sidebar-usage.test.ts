import { describe, expect, test } from "bun:test";
import { SIDEBAR_ITEMS, sidebarItemOrder } from "../src/lib/sidebar-items";
import {
  bumpUsage,
  learnedSet,
  listedTools,
  type SidebarUsage,
  topUsed,
  USAGE_HALF_LIFE_MS,
  usageScore,
} from "../src/lib/sidebar-usage";

const NOW = 1_800_000_000_000;
const order = [...SIDEBAR_ITEMS];
const visits = (list: [Parameters<typeof bumpUsage>[1], number][], at = NOW): SidebarUsage =>
  list.reduce<SidebarUsage>((u, [id, n]) => {
    let next = u;
    for (let i = 0; i < n; i++) next = bumpUsage(next, id, at);
    return next;
  }, {});

describe("learned usage", () => {
  test("a score halves every half-life", () => {
    const u = visits([["wiki", 4]]);
    expect(usageScore(u.wiki, NOW)).toBeCloseTo(4);
    expect(usageScore(u.wiki, NOW + USAGE_HALF_LIFE_MS)).toBeCloseTo(2);
    expect(usageScore(u.wiki, NOW - 1000)).toBeCloseTo(4);
    expect(usageScore(undefined, NOW)).toBe(0);
    expect(usageScore({ score: Number.NaN, at: NOW }, NOW)).toBe(0);
  });

  test("recent visits outweigh old ones", () => {
    const old = visits([["wiki", 10]], NOW - 4 * USAGE_HALF_LIFE_MS);
    const u = bumpUsage(bumpUsage(old, "calendar", NOW), "calendar", NOW);
    expect(topUsed(u, order, NOW, 1)).toEqual(["calendar"]);
  });

  test("the top N, ties by order, ignoring noise", () => {
    const u = visits([
      ["drive", 5],
      ["wiki", 3],
      ["calendar", 3],
      ["routines", 1],
      ["team", 1],
    ]);
    expect(topUsed(u, order, NOW)).toEqual(["drive", "wiki", "calendar"]);
    expect(topUsed(visits([["wiki", 1]], NOW - 10 * USAGE_HALF_LIFE_MS), order, NOW)).toEqual([]);
  });
});

describe("the learned set", () => {
  test("nothing learned: null; proposals never learned", () => {
    expect(learnedSet({}, order, NOW)).toBeNull();
    expect(learnedSet(visits([["proposals", 9]]), order, NOW)).toBeNull();
  });

  test("a free slot takes the best newcomer, once it is a habit", () => {
    expect(
      learnedSet(
        visits([
          ["wiki", 3],
          ["drive", 3],
        ]),
        order,
        NOW,
        ["wiki"],
      ),
    ).toEqual(["wiki", "drive"]);
  });

  test("one or two visits are not a habit: nothing is learned and nothing moves", () => {
    expect(learnedSet(visits([["issues", 1]]), order, NOW)).toBeNull();
    expect(learnedSet(visits([["issues", 2]]), order, NOW)).toBeNull();
    expect(learnedSet(visits([["issues", 3]]), order, NOW)).toEqual(["issues"]);
    // A tool already shown keeps its place on a lower score: the bar to stay is under the bar to enter.
    expect(learnedSet(visits([["issues", 1]]), order, NOW, ["issues"])).toEqual(["issues"]);
  });

  test("a full set swaps its weakest only past the margin", () => {
    const prev = ["wiki", "drive", "calendar"] as const;
    const close = visits([
      ["wiki", 4],
      ["drive", 4],
      ["calendar", 4],
      ["routines", 5],
    ]);
    expect(learnedSet(close, order, NOW, prev)?.sort()).toEqual(["calendar", "drive", "wiki"]);
    const clear = visits([
      ["wiki", 4],
      ["drive", 4],
      ["calendar", 4],
      ["routines", 7],
    ]);
    expect(learnedSet(clear, order, NOW, prev)?.sort()).toEqual(["calendar", "drive", "routines"]);
  });

  test("a tool shown before stays while it has a real score, even when others pass it slightly", () => {
    const usage = visits([
      ["wiki", 3],
      ["drive", 3],
      ["calendar", 3],
      ["routines", 4],
    ]);
    expect(learnedSet(usage, order, NOW, ["wiki", "drive", "calendar"])).toContain("calendar");
  });
});

describe("the tools in the list", () => {
  const base = { order, counts: {} };

  test("with nothing learned, today's defaults", () => {
    expect(listedTools({ ...base, items: undefined, learned: null })).toEqual(["threads", "issues", "drive", "team"]);
    expect(listedTools({ ...base, items: undefined, learned: null, counts: { waiting: 2 } })).toContain("waiting");
  });

  test("learned: the set and what has a count, always in the fixed order", () => {
    const learned = ["routines", "wiki", "calendar"] as const;
    expect(listedTools({ ...base, items: undefined, learned })).toEqual(["wiki", "routines", "calendar"]);
    const withCounts = listedTools({
      ...base,
      items: undefined,
      learned,
      counts: { waiting: 1, threads: 2, proposals: 3 },
    });
    expect(withCounts).toEqual(["waiting", "threads", "wiki", "routines", "calendar"]);
  });

  test("fewer habits than the list keeps: every always-in-sight default stays beside them", () => {
    // Routines became a habit: it joins the four defaults, none of them leaves.
    expect(listedTools({ ...base, items: undefined, learned: ["routines"] })).toEqual([
      "threads",
      "issues",
      "drive",
      "routines",
      "team",
    ]);
    // A default the person moved to More stays in More.
    expect(listedTools({ ...base, items: { threads: "more" }, learned: ["routines"] })).toEqual([
      "issues",
      "drive",
      "routines",
      "team",
    ]);
  });

  test("a place the person chose always wins", () => {
    const items = { wiki: "more", drive: "always", approvals: "auto" } as const;
    const listed = listedTools({ ...base, items, learned: ["wiki", "calendar", "routines"], counts: { approvals: 1 } });
    expect(listed).toEqual(["approvals", "drive", "routines", "calendar"]);
  });

  test("a personal workspace learns the same way", () => {
    expect(
      listedTools({ order: sidebarItemOrder(true), items: undefined, learned: ["drive"], counts: {}, personal: true }),
    ).toEqual(["drive"]);
  });
});
