type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function windowMs(kind: "minute" | "hour"): number {
  return kind === "minute" ? 60_000 : 3_600_000;
}

export function rateLimitCheck(params: {
  key: string;
  limit: number;
  window: "minute" | "hour";
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const w = windowMs(params.window);
  const existing = buckets.get(params.key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(params.key, { count: 1, resetAt: now + w });
    return { ok: true };
  }

  if (existing.count >= params.limit) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { ok: true };
}

export function checkChatRate(userId: string) {
  const limit = Number(process.env.RATE_LIMIT_CHAT_PER_MIN) || 20;
  return rateLimitCheck({
    key: `chat:${userId}`,
    limit,
    window: "minute",
  });
}

export function checkUploadRate(userId: string) {
  const limit = Number(process.env.RATE_LIMIT_UPLOAD_PER_HOUR) || 30;
  return rateLimitCheck({
    key: `upload:${userId}`,
    limit,
    window: "hour",
  });
}
