import type { ChatMessage } from "./providers/types.js";

/** 6 putaran terakhir (user + assistant) per chat. */
const MAX_MESSAGES = 12;

const store = new Map<number, ChatMessage[]>();

export function getHistory(chatId: number): ChatMessage[] {
  return [...(store.get(chatId) ?? [])];
}

function push(chatId: number, message: ChatMessage): void {
  const history = store.get(chatId) ?? [];
  history.push(message);
  while (history.length > MAX_MESSAGES) history.shift();
  store.set(chatId, history);
}

export function appendUser(chatId: number, content: string): void {
  push(chatId, { role: "user", content });
}

export function appendAssistant(chatId: number, content: string): void {
  push(chatId, { role: "assistant", content });
}

export function clearHistory(chatId: number): void {
  store.delete(chatId);
}

export function historySize(chatId: number): number {
  return store.get(chatId)?.length ?? 0;
}
