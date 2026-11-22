import { ProviderError } from "../util/errors.js";
import type {
  ChatRequest,
  ChatResponse,
  Provider,
  ProviderName,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;

interface OpenAiResponse {
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

export interface OpenAiCompatibleConfig {
  name: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
}

function extractError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as OpenAiResponse;
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

/**
 * Provider untuk API yang kompatibel dengan OpenAI chat completions
 * (xKiro dan endpoint OpenAI-compatible lainnya).
 */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleConfig,
): Provider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: options.name,
    model: options.model,

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
        model: options.model,
        messages,
        temperature: request.temperature ?? 0.7,
        [options.maxTokensField ?? "max_tokens"]: request.maxTokens ?? 2048,
        stream: false,
      };

      let response: Response;
      try {
        response = await fetch(`${options.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ProviderError(
          `${options.name} tidak bisa dihubungi: ${(error as Error).message}`,
          undefined,
          true,
        );
      }

      const raw = await response.text();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new ProviderError(
          `${options.name} HTTP ${response.status}: ${extractError(raw)}`,
          response.status,
          retryable,
        );
      }

      let data: OpenAiResponse;
      try {
        data = JSON.parse(raw) as OpenAiResponse;
      } catch {
        throw new ProviderError(
          `Respons ${options.name} bukan JSON yang valid`,
          undefined,
          true,
        );
      }

      const choice = data.choices?.[0];
      const text = textFromContent(choice?.message?.content);

      if (!text) {
        throw new ProviderError(
          `${options.name} mengembalikan jawaban kosong (finishReason: ${choice?.finish_reason ?? "unknown"})`,
          undefined,
          true,
        );
      }

      return {
        text,
        model: options.model,
        provider: options.name,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - started,
      };
    },
  };
}
