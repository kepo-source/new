import { config } from "../config.js";
import { createGeminiProvider } from "./gemini.js";
import { createGroqProvider } from "./groq.js";
import type { Provider, ProviderName } from "./types.js";

const registry: Partial<Record<ProviderName, Provider>> = {};

if (config.gemini.apiKey) registry.gemini = createGeminiProvider();
if (config.groq.apiKey) registry.groq = createGroqProvider();

export const providers: Readonly<Partial<Record<ProviderName, Provider>>> =
  registry;

export const availableProviders = Object.keys(registry) as ProviderName[];

export function getProvider(name: ProviderName): Provider {
  const provider = registry[name];
  if (!provider) {
    throw new Error(`Provider "${name}" belum dikonfigurasi.`);
  }
  return provider;
}

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  gemini: "Gemini",
  groq: "Groq",
};

export const PROVIDER_EMOJI: Record<ProviderName, string> = {
  gemini: "🟦",
  groq: "🟪",
};

export function providerLabel(name: ProviderName): string {
  return PROVIDER_LABEL[name];
}

export type { Provider, ProviderName };
