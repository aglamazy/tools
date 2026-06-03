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
        if (newStore !== undefined) {
          context.session.activeStore = newStore;
        }
        return {
          result: "ok",
          replyText: `עברתי ל${storeLabel(newStore ?? context.session.activeStore)}.`,
        };
      }

      const action: ChatAction = { action: decl.name, ...args };
      const out = await executeActions(
        context.uid,
        [action],
        context.session.activeStore,
        context.anonStoreCreds,
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
