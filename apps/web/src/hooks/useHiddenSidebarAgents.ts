import { useHiddenSidebarAgentIds } from "@agenteschat/client";
import { useEffect } from "react";
import { useOrg } from "@/components/org-context";
import { STORAGE_KEYS, storage, storedStrings } from "@/lib/storage";

/**
 * "Esconder da sidebar": the agents this person took off the sidebar's AGENTES list in this workspace. The agent keeps
 * working and answering, and stays one Ctrl K away; Personalizar brings it back. Saved with the sidebar view
 * (`…/me/sidebar/view`), so it holds on every device. Builds before that kept the list in this browser: the first load
 * sends it once and clears it.
 */
const legacyKey = (userId: string, orgId: string) => `${STORAGE_KEYS.sidebarHiddenAgents}.${userId}.${orgId}`;

export function useHiddenSidebarAgents() {
  const { org, me } = useOrg();
  const hidden = useHiddenSidebarAgentIds(org.id);
  const { loaded, adopt } = hidden;
  const key = legacyKey(me.user.id, org.id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per workspace when the view arrives
  useEffect(() => {
    if (!loaded) return;
    try {
      const kept = storedStrings(key);
      if (kept.length) adopt(kept);
      if (storage.get(key) !== null) storage.remove(key);
    } catch {
      // Not migrated: the list stays where it was.
    }
  }, [loaded, key]);
  return { ids: hidden.ids, hide: hidden.hide, show: hidden.show };
}
