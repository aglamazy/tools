import { createToolRegistry, type LLMTool, type ToolDeclaration, type ToolDispatcher } from "agents-ai";
import { ACTION_DECLARATIONS } from "@/app/services/chat/actionDeclarations";
import { executeActions, type AnonStoreCreds, type PendingProductSelection } from "@/app/services/chat/actionExecutor";
import type { ChatAction } from "@/app/services/chat/chatProcessor";
import { getAllStores } from "@/app/services/grocery/storeRegistry";
import type { SessionState } from "@/app/services/chat/history";

export interface AglamazoToolContext {
  uid: string;
  /** Shared, mutable. Same reference passed to processChat via HistoryStore.load —
   *  tools update activeStore here and processChat persists it on save. */
  session: SessionState;
  anonStoreCreds: AnonStoreCreds | null | undefined;
  anonCredsTouched: boolean;
  pendingSelections: PendingProductSelection[];
  /**
   * C01 same-turn consent defense: whether Tier-3 server-creds consent existed
   * BEFORE this user turn began. Snapshotted once in processChatMessage and
   * threaded into every per-tool-call executeActions so a turn that bundles
   * `grant_server_creds_consent` + `set_credentials` can't self-authorize the
   * save (the dispatcher calls executeActions once per tool, so a per-call
   * re-snapshot would see the just-granted consent — that was the regression).
   */
  consentExistedAtTurnStart: boolean;
}

function storeLabel(storeId: string | null | undefined): string {
  if (!storeId) return "ללא חנות פעילה";
  const all = getAllStores();
  return all.find((s) => s.id === storeId)?.label ?? storeId;
}

export function createAglamazoToolRegistry(): {
  declarations: LLMTool[];
  dispatch: ToolDispatcher<AglamazoToolContext>;
} {
  const tools: ToolDeclaration[] = ACTION_DECLARATIONS.map((decl) => ({
    declaration: decl as LLMTool,
    execute: async (args, ctx) => {
      const context = ctx as AglamazoToolContext;

      if (decl.name === "set_session") {
        const newStore =
          typeof args.activeStore === "string" || args.activeStore === null
            ? (args.activeStore as string | null)
            : undefined;
        // No-op when the LLM re-asserts the current store (common when the
        // user simply mentions the store they're already in). Stay silent
        // instead of surfacing "עברתי ל..." — that became user-visible noise.
        if (newStore === undefined || newStore === context.session.activeStore) {
          return { result: "ok" };
        }
        context.session.activeStore = newStore;
        return {
          result: "ok",
          replyText: `עברתי ל${storeLabel(newStore)}.`,
        };
      }

      const action: ChatAction = { action: decl.name, ...args };
      const out = await executeActions(
        context.uid,
        [action],
        context.session.activeStore,
        context.anonStoreCreds,
        context.consentExistedAtTurnStart,
      );

      if (out.anonStoreCreds !== undefined) {
        context.anonStoreCreds = out.anonStoreCreds;
        context.anonCredsTouched = true;
      }

      let stop = false;
      if (out.pendingSelections?.length) {
        context.pendingSelections.push(...out.pendingSelections);
        stop = true;
      }

      const first = out.results[0];
      return {
        result: first?.result ?? "",
        stop,
      };
    },
  }));

  return createToolRegistry<AglamazoToolContext>(tools);
}
