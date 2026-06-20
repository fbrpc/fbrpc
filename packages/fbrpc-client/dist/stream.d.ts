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
export declare function streamRequest<D extends ApiDef>(url: string, req: ReqOf<D>, opts?: StreamOptions): AsyncGenerator<unknown, void, undefined>;
//# sourceMappingURL=stream.d.ts.map