export type ProviderName = "gemini" | "grok";

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;
  model: string;
  provider: ProviderName;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
