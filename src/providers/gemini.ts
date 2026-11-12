import { config } from "../config.js";
import { ProviderError } from "../util/errors.js";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 90_000;

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string; code?: number };
}

function extractError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as GeminiResponse;
    return parsed.error?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export function createGeminiProvider(model = config.gemini.model): Provider {
  return {
    name: "gemini",
    model,

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const started = Date.now();

      const body = {
        ...(request.system
          ? { systemInstruction: { parts: [{ text: request.system }] } }
          : {}),
        contents: request.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 2048,
        },
      };

      const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new ProviderError(
          `Gemini tidak bisa dihubungi: ${(error as Error).message}`,
          undefined,
          true,
        );
      }

      const raw = await response.text();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new ProviderError(
          `Gemini HTTP ${response.status}: ${extractError(raw)}`,
          response.status,
          retryable,
        );
      }

      let data: GeminiResponse;
      try {
        data = JSON.parse(raw) as GeminiResponse;
      } catch {
        throw new ProviderError("Respons Gemini bukan JSON yang valid", undefined, true);
      }

      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new ProviderError(
          `Gemini mengembalikan jawaban kosong (finishReason: ${candidate?.finishReason ?? "unknown"})`,
          undefined,
          true,
        );
      }

      return {
        text,
        model,
        provider: "gemini",
        tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - started,
      };
    },
  };
}
