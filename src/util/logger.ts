import pino from "pino";
import { config } from "../config.js";

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
});
