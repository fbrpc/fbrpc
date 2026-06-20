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
import type { ApiDef, Protocol, ReqOf, StreamCall } from "@birderr/fbrpc-core";

export interface StreamOptions {
  /** 每次请求前调用，返回 HTTP headers */
  getHeaders?: () => Record<string, string>;
}

/**
 * SSE 流式请求，返回 async iterable。
 *
 * 注意：这是底层函数，直接拼 URL。
 * 高级用法请用 createClient() + 模块协议定义。
 */
export async function* streamRequest<D extends ApiDef>(
  url: string,
  req: ReqOf<D>,
  opts?: StreamOptions,
): AsyncGenerator<unknown, void, undefined> {
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts?.getHeaders) {
    headers = { ...headers, ...opts.getHeaders() };
  }

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

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const json = line.slice(6);
          try {
            yield JSON.parse(json);
          } catch {
            // 非 JSON 数据直接透传
            yield json;
          }
        } else if (line.startsWith("event: error")) {
          // 下一行 data 包含错误信息
          continue;
        } else if (line.startsWith("event: done")) {
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
