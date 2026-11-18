import type { SidebarItem, SidebarItems } from "../api/types";
import { inSidebarList, SIDEBAR_COUNTED, sidebarDefaults } from "./sidebar-items";

/**
 * What a person opened, per tool: a score that fades with time. Kept on the device (nothing is sent to the server), so
 * the sidebar can learn what this person uses without a new setting, API or migration.
 */
export type SidebarUsage = Partial<Record<SidebarItem, { score: number; at: number }>>;

/** A visit counts half as much after this long: last week's habit gives way to this week's. */
export const USAGE_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/** How many tools the learned list keeps in sight, besides the ones with something waiting. */
export const USAGE_TOP = 3;

/** A score below this is noise (a stray click long ago), not a habit. */
const USAGE_FLOOR = 0.05;

/** One entry's score at `now`: its saved score faded by the time since the last visit. */
export const usageScore = (entry: { score: number; at: number } | undefined, now: number): number =>
  entry && Number.isFinite(entry.score) && Number.isFinite(entry.at)
    ? entry.score * 0.5 ** (Math.max(0, now - entry.at) / USAGE_HALF_LIFE_MS)
    : 0;

/** `usage` with one more visit to `item` at `now`: the old score fades to now, then one is added. */
export const bumpUsage = (usage: SidebarUsage, item: SidebarItem, now: number): SidebarUsage => ({
  ...usage,
  [item]: { score: usageScore(usage[item], now) + 1, at: now },
});

/** The `n` most-used tools at `now` (ties: the earlier in `order`), only those with a real score. */
export function topUsed(
  usage: SidebarUsage,
  order: readonly SidebarItem[],
  now: number,
  n: number = USAGE_TOP,
): SidebarItem[] {
  return order
    .map((id, i) => ({ id, i, s: usageScore(usage[id], now) }))
    .filter((x) => x.s >= USAGE_FLOOR)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.id);
}

/** A newcomer must score this many times the weakest tool already shown to take its place. */
export const USAGE_MARGIN = 1.5;

/**
 * A tool counts as a habit only from about three recent visits (a score this high): one stray visit never moves the
 * list. A tool already shown stays while it keeps a real score (`USAGE_FLOOR`), so the bar to enter is higher than the
 * bar to stay, and the set changes rarely.
 */
export const USAGE_HABIT = 2.5;

/**
 * The learned set: the tools to keep in sight for this usage, or `null` with nothing learned yet (the defaults then
 * apply). `previous` is the set shown last time: it only changes by a clear margin, so a tool that is on the edge never
 * flips in and out, and menus keep their places (an adaptive menu that moves hurts the person's spatial memory). A
 * tool of `previous` stays while it still has a real score; a free slot takes the best newcomer; a full set swaps its
 * weakest tool only for a newcomer scoring `USAGE_MARGIN` times more.
 */
export function learnedSet(
  usage: SidebarUsage,
  order: readonly SidebarItem[],
  now: number,
  previous: readonly SidebarItem[] = [],
  n: number = USAGE_TOP,
  margin: number = USAGE_MARGIN,
): SidebarItem[] | null {
  // Proposals are a tab of Approvals: using it never gives it a row of its own (only the person's choice does).
  const learnable = order.filter((id) => id !== "proposals");
  const score = (id: SidebarItem) => usageScore(usage[id], now);
  // What was shown stays while it has a real score; a newcomer enters only once it is a habit.
  const ranked = topUsed(usage, learnable, now, learnable.length).filter(
    (id) => previous.includes(id) || score(id) >= USAGE_HABIT,
  );
  if (!ranked.length) return null;
  const kept = ranked.filter((id) => previous.includes(id)).slice(0, n);
  const set = [...kept];
  for (const id of ranked) {
    if (set.includes(id)) continue;
    if (set.length < n) {
      set.push(id);
      continue;
    }
    const weakest = set.reduce((w, x) => (score(x) < score(w) ? x : w));
    if (score(id) > score(weakest) * margin) set[set.indexOf(weakest)] = id;
  }
  return set;
}

/**
 * The tools in the sidebar's list, always in `order` (what is learned decides only which are in sight, never where
 * they sit). A place the person chose (it is in `items`, which drops whatever equals the default) always wins. For the
 * rest: with nothing learned (`learned` null), the defaults; after it, the counted tools that have something now and
 * the learned set, everything else in More.
 */
export function listedTools(opts: {
  order: readonly SidebarItem[];
  items: SidebarItems | undefined;
  counts: Partial<Record<SidebarItem, number>>;
  learned: readonly SidebarItem[] | null;
  personal?: boolean;
}): SidebarItem[] {
  const { order, items, counts, learned, personal = false } = opts;
  const defaults = sidebarDefaults(personal);
  // Fewer habits than the list keeps: every always-in-sight default stays beside them, so the list only grows until
  // the habits are known and nothing a person used to see leaves after one visit.
  const filled =
    learned &&
    (learned.length >= USAGE_TOP
      ? learned
      : [...learned, ...order.filter((id) => !learned.includes(id) && !items?.[id] && defaults[id] === "always")]);
  return order.filter((id) => {
    const count = counts[id] ?? 0;
    const chosen = items?.[id];
    if (chosen) return inSidebarList(chosen, count);
    if (!filled) return inSidebarList(defaults[id], count);
    // A counted tool shows while it has something, unless its default keeps it out of sight altogether.
    if (SIDEBAR_COUNTED.includes(id) && defaults[id] !== "more" && count > 0) return true;
    return filled.includes(id);
  });
}
