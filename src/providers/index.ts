import { config } from "../config.js";
import { createGeminiProvider } from "./gemini.js";
import { createGroqProvider } from "./groq.js";
import { createXkiroProvider } from "./xkiro.js";
import type { Provider, ProviderName } from "./types.js";

const registry: Partial<Record<ProviderName, Provider>> = {};

if (config.xkiro.apiKey) registry.xkiro = createXkiroProvider("xkiro");
if (config.xkirov2.apiKey) registry.xkirov2 = createXkiroProvider("xkirov2");
if (config.xkirov3.apiKey) registry.xkirov3 = createXkiroProvider("xkirov3");
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
  xkiro: "xKiro",
  xkirov2: "xKiro 2",
  xkirov3: "xKiro 3",
  gemini: "Gemini",
  groq: "Groq",
};

export const PROVIDER_EMOJI: Record<ProviderName, string> = {
  xkiro: "🟩",
  xkirov2: "🟨",
  xkirov3: "🟧",
  gemini: "🟦",
  groq: "🟪",
};

export function providerLabel(name: ProviderName): string {
  return PROVIDER_LABEL[name];
}

export type { Provider, ProviderName };
