import { config } from "../config.js";
import { createOpenAiCompatibleProvider } from "./openai.js";
import type { Provider } from "./types.js";

export function createGrokProvider(model = config.grok.model): Provider {
  return createOpenAiCompatibleProvider({
    name: "grok",
    model,
    baseUrl: config.grok.baseUrl,
    apiKey: config.grok.apiKey,
  });
}
