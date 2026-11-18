import type { SidebarItem } from "@agenteschat/client";
import { bumpUsage, learnedSet, type SidebarUsage } from "@agenteschat/client/lib/sidebar-usage";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SIDEBAR_TOOLS } from "@/components/SidebarSetup";
import { STORAGE_KEYS, storage } from "@/lib/storage";

const TOOLS = Object.keys(SIDEBAR_TOOLS) as SidebarItem[];

type Saved = { usage: SidebarUsage; shown: SidebarItem[] };

const read = (key: string): Saved => {
  try {
    const v = JSON.parse(storage.get(key) ?? "{}");
    const usage = v?.usage && typeof v.usage === "object" && !Array.isArray(v.usage) ? (v.usage as SidebarUsage) : {};
    const shown = Array.isArray(v?.shown)
      ? v.shown.filter((x: unknown): x is SidebarItem => TOOLS.includes(x as SidebarItem))
      : [];
    return { usage, shown };
  } catch {
    return { usage: {}, shown: [] };
  }
};

/** The tool whose page `pathname` is in (the tool's own route or anything under it), if any. */
export const toolAt = (pathname: string, orgId: string): SidebarItem | undefined =>
  TOOLS.find((id) => {
    const base = SIDEBAR_TOOLS[id].to.replace("$orgId", orgId);
    return pathname === base || pathname.startsWith(`${base}/`);
  });

/**
 * What this person opens, learned in this browser for each workspace: one visit each time they arrive at a tool's page
 * (moving around inside it doesn't count again). The set of tools to keep in sight is worked out once when the
 * workspace loads, from the set shown last time with a margin, so nothing moves under the pointer mid-session. Nothing
 * leaves the device, and where storage is blocked it just starts over. `null`: nothing learned yet (the defaults apply).
 */
export function useSidebarUsage(userId: string, orgId: string, order: readonly SidebarItem[]): SidebarItem[] | null {
  const key = `${STORAGE_KEYS.sidebarUsage}.${userId}.${orgId}`;
  const [start, setStart] = useState(() => load(key, order));
  const usage = useRef(start.saved.usage);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const last = useRef<SidebarItem | undefined>(undefined);
  // A change of workspace or account starts from what that one learned.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the set is decided once per workspace load, not when the order changes.
  useEffect(() => {
    const next = load(key, order);
    usage.current = next.saved.usage;
    last.current = undefined;
    setStart(next);
  }, [key]);
  useEffect(() => {
    const tool = toolAt(pathname, orgId);
    if (tool === last.current) return;
    last.current = tool;
    if (!tool) return;
    usage.current = bumpUsage(usage.current, tool, Date.now());
    storage.set(key, JSON.stringify({ usage: usage.current, shown: start.learned ?? [] }));
  }, [pathname, orgId, key, start]);
  return start.learned;
}

function load(key: string, order: readonly SidebarItem[]) {
  const saved = read(key);
  return { saved, learned: learnedSet(saved.usage, order, Date.now(), saved.shown) };
}
