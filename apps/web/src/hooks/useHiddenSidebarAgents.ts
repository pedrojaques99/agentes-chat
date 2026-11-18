import { useSyncExternalStore } from "react";
import { useOrg } from "@/components/org-context";
import { STORAGE_KEYS, storage, storedStrings } from "@/lib/storage";

/**
 * "Esconder da sidebar": the agents this person took off the sidebar's AGENTES list in this workspace. The agent keeps
 * working and answering, and stays one Ctrl K away; Personalizar brings it back. Kept in this browser (per person and
 * workspace, like the closed categories), not on the server: the saved sidebar view has no field for it.
 */
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; ids: ReadonlySet<string> }>();

const keyOf = (userId: string, orgId: string) => `${STORAGE_KEYS.sidebarHiddenAgents}.${userId}.${orgId}`;

function read(key: string): ReadonlySet<string> {
  const raw = storage.get(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.ids;
  const ids: ReadonlySet<string> = new Set(storedStrings(key));
  cache.set(key, { raw, ids });
  return ids;
}

function write(key: string, ids: Iterable<string>) {
  storage.set(key, JSON.stringify([...ids]));
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useHiddenSidebarAgents() {
  const { org, me } = useOrg();
  const key = keyOf(me.user.id, org.id);
  const ids = useSyncExternalStore(subscribe, () => read(key));
  return {
    ids,
    hide: (agentId: string) => write(key, new Set([...read(key), agentId])),
    show: (agentId: string) =>
      write(
        key,
        [...read(key)].filter((id) => id !== agentId),
      ),
  };
}
