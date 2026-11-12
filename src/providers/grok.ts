import { config } from "../config.js";
import { ProviderError } from "../util/errors.js";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";

const TIMEOUT_MS = 120_000;

interface GrokResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
}

function extractError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as GrokResponse;
    return parsed.error?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

function textFromContent(
  content: string | Array<{ text?: string }> | undefined,
): string {
  if (!content) return "";
  if (typeof content === "string") return content.trim();
  return content
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export function createGrokProvider(model = config.grok.model): Provider {
  return {
    name: "grok",
    model,

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const started = Date.now();

      const messages = [
        ...(request.system
          ? [{ role: "system" as const, content: request.system }]
          : []),
        ...request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];

      const body = {
        model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: false,
      };

      let response: Response;
      try {
        response = await fetch(`${config.grok.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.grok.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new ProviderError(
          `Grok tidak bisa dihubungi: ${(error as Error).message}`,
          undefined,
          true,
        );
      }

      const raw = await response.text();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new ProviderError(
          `Grok HTTP ${response.status}: ${extractError(raw)}`,
          response.status,
          retryable,
        );
      }

      let data: GrokResponse;
      try {
        data = JSON.parse(raw) as GrokResponse;
      } catch {
        throw new ProviderError("Respons Grok bukan JSON yang valid", undefined, true);
      }

      const choice = data.choices?.[0];
      const text = textFromContent(choice?.message?.content);

      if (!text) {
        throw new ProviderError(
          `Grok mengembalikan jawaban kosong (finishReason: ${choice?.finish_reason ?? "unknown"})`,
          undefined,
          true,
        );
      }

      return {
        text,
        model,
        provider: "grok",
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - started,
      };
    },
  };
}
