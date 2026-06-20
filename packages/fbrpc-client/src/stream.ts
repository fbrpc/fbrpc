/**
 * fbrpc SSE 流式客户端。
 *
 * 用法:
 *   for await (const chunk of streamClient("http://localhost:3008/api/agent/chat", {
 *     messages: [...]
 *   })) {
 *     console.log(chunk);
 *   }
 */
import type { ApiDef, ReqOf } from "@fbrpc/fbrpc-core";

export interface StreamOptions {
  /** 附加的 HTTP headers */
  headers?: Record<string, string>;
}

/**
 * SSE 流式请求，返回 async iterable。
 */
export async function* streamRequest<D extends ApiDef>(
  url: string,
  req: ReqOf<D>,
  opts?: StreamOptions,
): AsyncGenerator<unknown, void, undefined> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts?.headers,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 SSE 帧分割
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7);
        } else if (line.startsWith("data: ")) {
          const json = line.slice(6);
          if (eventType === "error") {
            const parsed = JSON.parse(json) as { error: string; code?: string };
            throw new Error(`${parsed.code ?? "API_ERROR"}: ${parsed.error}`);
          }
          if (eventType === "done") return;
          // 普通数据帧
          eventType = "";
          try {
            yield JSON.parse(json);
          } catch {
            yield json;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
