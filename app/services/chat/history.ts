import type { HistoryStore, StoredMessage } from "agents-ai/core";
import { getAdminFirestore } from "@/app/lib/firebaseAdmin";

export interface SessionState {
  activeStore?: string | null;
}

export const ANON_PREFIX = "anon:";
export function isAnonUid(uid: string): boolean {
  return uid.startsWith(ANON_PREFIX);
}

const MAX_HISTORY = 10;

export function createChatHistoryStore(
  collection: string,
): HistoryStore<SessionState> {
  return {
    async load(conversationId: string) {
      if (isAnonUid(conversationId)) return { messages: [], session: {} };
      const doc = await getAdminFirestore()
        .collection(collection)
        .doc(conversationId)
        .get();
      if (!doc.exists) return { messages: [], session: {} };
      const data = doc.data()!;
      return {
        messages: (data.messages as StoredMessage[]) || [],
        session: (data.session as SessionState) || {},
      };
    },
    async save(
      conversationId: string,
      messages: StoredMessage[],
      session?: SessionState,
    ) {
      if (isAnonUid(conversationId)) return;
      const trimmed = messages.slice(-MAX_HISTORY);
      await getAdminFirestore().collection(collection).doc(conversationId).set({
        messages: trimmed,
        session: session ?? {},
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
