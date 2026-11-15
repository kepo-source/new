import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { config, type GeminiThinkingLevel } from "../config.js";
import { ProviderError } from "../util/errors.js";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";

const TIMEOUT_MS = 90_000;

const SDK_THINKING_LEVEL: Record<GeminiThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.XHIGH,
};

function cleanMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return (parsed.error?.message ?? raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

/** Hint tambahan kalau key AI Studio (format `AQ.`) ditolak Google. */
function authHint(status: number, message: string): string {
  if (status !== 401 && status !== 403) return "";
  if (!/ACCESS_TOKEN_TYPE_UNSUPPORTED|API key not valid/i.test(message)) {
    return "";
  }
  return (
    " — key Gemini (biasanya format AQ.) belum aktif untuk Gemini API. " +
    "Pastikan key dibuat di project yang sudah enable Generative Language API " +
    "dan billing, atau buat key baru di aistudio.google.com/apikey."
  );
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ApiError) {
    const status = typeof error.status === "number" ? error.status : undefined;
    const retryable = status === 429 || (status ?? 0) >= 500;
    const message = cleanMessage(error.message);
    return new ProviderError(
      `Gemini HTTP ${status ?? "?"}: ${message}${authHint(status ?? 0, message)}`,
      status,
      retryable,
    );
  }

  return new ProviderError(
    `Gemini tidak bisa dihubungi: ${(error as Error).message}`,
    undefined,
    true,
  );
}

export function createGeminiProvider(model = config.gemini.model): Provider {
  // SDK resmi Google Gen AI. Endpoint default-nya generativelanguage.googleapis.com
  // dan key dikirim lewat header x-goog-api-key (tidak pernah muncul di URL).
  const ai = new GoogleGenAI({
    apiKey: config.gemini.apiKey,
    httpOptions: { timeout: TIMEOUT_MS },
  });

  const thinkingLevel = SDK_THINKING_LEVEL[config.gemini.thinkingLevel];

  return {
    name: "gemini",
    model,

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const started = Date.now();

      try {
        const response = await ai.models.generateContent({
          model,
          contents: request.messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          config: {
            ...(request.system ? { systemInstruction: request.system } : {}),
            temperature: request.temperature ?? 0.7,
            // Thinking token ikut dihitung ke limit output, jadi beri ruang
            // lebih dari provider non-thinking.
            maxOutputTokens: request.maxTokens ?? 4096,
            thinkingConfig: { thinkingLevel },
          },
        });

        const candidate = response.candidates?.[0];
        const text = (response.text ?? "").trim();

        if (!text) {
          throw new ProviderError(
            `Gemini mengembalikan jawaban kosong (finishReason: ${candidate?.finishReason ?? "unknown"})`,
            undefined,
            true,
          );
        }

        const usage = response.usageMetadata;

        return {
          text,
          model,
          provider: "gemini",
          tokensIn: usage?.promptTokenCount ?? 0,
          // Token hasil thinking tetap ditagih sebagai output.
          tokensOut:
            (usage?.candidatesTokenCount ?? 0) +
            (usage?.thoughtsTokenCount ?? 0),
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw toProviderError(error);
      }
    },
  };
}
