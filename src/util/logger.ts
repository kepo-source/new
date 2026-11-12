import pino from "pino";
import { config } from "../config.js";
import { redactDeep } from "./redact.js";

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "token",
      "apiKey",
      "*.token",
      "*.apiKey",
      "authorization",
      "headers.authorization",
      "err.config.headers.authorization",
    ],
    censor: "[redacted]",
  },
  base: undefined,
  hooks: {
    logMethod(args, method) {
      const sanitized = args.map((arg) => redactDeep(arg));
      method.apply(this, sanitized as Parameters<typeof method>);
    },
  },
  formatters: {
    log(object) {
      return redactDeep(object) as Record<string, unknown>;
    },
  },
});
