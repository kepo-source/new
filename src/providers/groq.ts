import { config } from "../config.js";
import { createOpenAiCompatibleProvider } from "./openai.js";
import type { Provider } from "./types.js";

export function createGroqProvider(model = config.groq.model): Provider {
  return createOpenAiCompatibleProvider({
    name: "groq",
    model,
    baseUrl: config.groq.baseUrl,
    apiKey: config.groq.apiKey,
    maxTokensField: "max_completion_tokens",
  });
}
