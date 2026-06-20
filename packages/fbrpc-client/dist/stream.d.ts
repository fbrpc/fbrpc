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
import type { ApiDef, ReqOf } from "@birderr/fbrpc-core";
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
export declare function streamRequest<D extends ApiDef>(url: string, req: ReqOf<D>, opts?: StreamOptions): AsyncGenerator<unknown, void, undefined>;
//# sourceMappingURL=stream.d.ts.map