import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { logger } from "./util/logger.js";
import { redactString } from "./util/redact.js";

const execFileAsync = promisify(execFile);
const FIXED_BINARY = "/app/.hermes-bin/hermes";
const KEY_ENV = "HERMES_XKIRO_KEY";

type KeyCandidate = {
  label: string;
  key: string;
};

function keyCandidates(): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  if (config.hermes.apiKey) {
    candidates.push({ label: "hermes", key: config.hermes.apiKey });
  }
  candidates.push(
    { label: "xkiro", key: config.xkiro.apiKey },
    { label: "xkirov2", key: config.xkirov2.apiKey },
    { label: "xkirov3", key: config.xkirov3.apiKey },
  );
  return candidates.filter((candidate) => Boolean(candidate.key));
}

function resolveBinary(): string {
  if (config.hermes.binary) return config.hermes.binary;
  if (existsSync(FIXED_BINARY)) return FIXED_BINARY;
  return "hermes";
}

/**
 * Config Hermes dibuat ulang setiap run. Tidak ada API key yang ditulis ke
 * config.yaml — kunci cuma dilewatkan lewat env HERMES_XKIRO_KEY ke proses.
 */
function writeHermesConfig(): void {
  const home = config.hermes.home;
  mkdirSync(home, { recursive: true, mode: 0o700 });

  const yaml = [
    "model:",
    `  default: ${JSON.stringify(config.hermes.model)}`,
    "  provider: xkiro",
    `  context_length: ${config.hermes.contextLength}`,
    "providers:",
    "  xkiro:",
    `    api: ${JSON.stringify(config.hermes.baseUrl)}`,
    `    key_env: ${KEY_ENV}`,
    "    transport: chat_completions",
    "",
  ].join("\n");

  writeFileSync(join(home, "config.yaml"), yaml, { mode: 0o600 });

  // Hermes doctor akan complain kalau file ini tidak ada. Isinya sengaja kosong:
  // semua credential datang dari process env saat spawn.
  const envPath = join(home, ".env");
  if (!existsSync(envPath)) writeFileSync(envPath, "", { mode: 0o600 });
}

function sanitize(text: string, key: string): string {
  return redactString(text.split(key).join("[redacted]"))
    .replace(/\s+/g, " ")
    .trim();
}

export async function runHermes(prompt: string): Promise<string> {
  if (!config.hermes.enabled) {
    throw new Error("Hermes sedang dimatikan (HERMES_ENABLED=false).");
  }

  const candidates = keyCandidates();
  if (candidates.length === 0) {
    throw new Error(
      "Hermes butuh API key. Isi XKIRO_API_KEY (atau HERMES_API_KEY) dulu.",
    );
  }

  writeHermesConfig();

  const binary = resolveBinary();
  const args = [
    `--oneshot=${prompt}`,
    "--toolsets=", // tidak ada tool: agent hanya menjawab, tidak jalanin shell/file
  ];
  let lastError = "tidak diketahui";

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(binary, args, {
        encoding: "utf8",
        cwd: process.cwd(),
        env: {
          ...process.env,
          HERMES_HOME: config.hermes.home,
          [KEY_ENV]: candidate.key,
        },
        timeout: config.hermes.timeoutMs,
        killSignal: "SIGTERM",
        maxBuffer: 2_000_000,
      });

      const answer = stdout.trim();
      if (!answer) {
        lastError = "Hermes selesai tanpa output";
        logger.warn({ key: candidate.label }, lastError);
        continue;
      }
      return answer;
    } catch (error) {
      const failure = error as {
        killed?: boolean;
        message?: string;
        stderr?: string;
        stdout?: string;
      };
      const detail = sanitize(
        [failure.stderr, failure.stdout, failure.message]
          .filter(Boolean)
          .join(" "),
        candidate.key,
      );
      lastError = failure.killed
        ? `timeout setelah ${config.hermes.timeoutMs}ms`
        : detail || "exit code bukan 0";
      logger.warn(
        { key: candidate.label, err: { message: lastError.slice(0, 300) } },
        "Attempt Hermes gagal",
      );
    }
  }

  throw new Error(`Hermes gagal: ${lastError.slice(0, 300)}`);
}
