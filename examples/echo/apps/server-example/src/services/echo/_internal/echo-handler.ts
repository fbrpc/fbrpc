import type { ServiceError } from "../_internal_index.js";

// ── 普通 RPC ──

export interface EchoResult {
  message: string;
  timestamp: number;
  err?: ServiceError;
}

export function handleEcho(req: { message: string }): EchoResult {
  if (!req.message) return { message: "", timestamp: 0, err: { message: "消息不能为空", code: "VALIDATION" } };

  return {
    message: req.message,
    timestamp: Date.now(),
  };
}

// ── 流式 SSE ──

export async function* handleStreamEcho(
  req: { count: number; delay?: number },
): AsyncGenerator<{ index: number; message: string }> {
  if (req.count < 1) throw new Error("count 至少为 1");

  for (let i = 1; i <= req.count; i++) {
    await sleep(req.delay ?? 500);
    yield { index: i, message: `echo #${i}` };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
