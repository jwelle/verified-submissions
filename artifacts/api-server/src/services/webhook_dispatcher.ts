import { logger } from "../lib/logger.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_ATTEMPTS = 3;

interface WebhookFetchResponse {
  ok: boolean;
  status: number;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  retry_attempts?: number;
  timeout_seconds?: number;
}

export interface WebhookResult {
  success: boolean;
  status_code: number | null;
  error: string | null;
  attempts: number;
}

export async function dispatch_outbound_webhook(
  payload: Record<string, unknown>,
  config: WebhookConfig,
): Promise<WebhookResult> {
  if (!config.enabled) {
    return {
      success: false,
      status_code: null,
      error: "Webhook not enabled in config",
      attempts: 0,
    };
  }

  if (!config.url) {
    return {
      success: false,
      status_code: null,
      error: "No webhook URL configured",
      attempts: 0,
    };
  }

  const max_attempts = config.retry_attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const timeout_ms = (config.timeout_seconds ?? 5) * 1000;
  const method = config.method ?? "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  let last_error: string | null = null;
  let last_status: number | null = null;

  for (let attempt = 1; attempt <= max_attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout_ms);

    try {
      const response = (await fetch(config.url, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })) as WebhookFetchResponse;

      clearTimeout(timer);
      last_status = response.status;

      if (response.ok) {
        logger.info(
          { url: config.url, status: response.status, attempt },
          "Outbound webhook delivered",
        );
        return {
          success: true,
          status_code: response.status,
          error: null,
          attempts: attempt,
        };
      }

      last_error = `HTTP ${response.status}`;
      logger.warn(
        { url: config.url, status: response.status, attempt },
        "Webhook attempt failed",
      );
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      last_error = isTimeout
        ? `Timeout after ${timeout_ms}ms`
        : err instanceof Error
          ? err.message
          : "Unknown error";

      logger.warn(
        { url: config.url, attempt, error: last_error },
        "Webhook attempt threw",
      );
    }

    // Small back-off between retries
    if (attempt < max_attempts) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }

  // All attempts failed — return warning, do NOT throw to avoid breaking main flow
  return {
    success: false,
    status_code: last_status,
    error: `Failed after ${max_attempts} attempts: ${last_error}`,
    attempts: max_attempts,
  };
}
