import { createGeminiProvider } from "./gemini.js";
import { createGrokProvider } from "./grok.js";
import type { Provider, ProviderName } from "./types.js";

export const providers: Record<ProviderName, Provider> = {
  gemini: createGeminiProvider(),
  grok: createGrokProvider(),
};

export function otherProvider(name: ProviderName): ProviderName {
  return name === "gemini" ? "grok" : "gemini";
}

export type { Provider, ProviderName };
