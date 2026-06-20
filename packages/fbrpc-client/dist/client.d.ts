/**
 * fbrpc 类型安全客户端 — Proxy 驱动。
 *
 * 用法:
 *   const api = createClient<{ echo: EchoProtocol }, { echo: readonly ["streamEcho"] }>({
 *     baseUrl: "http://localhost:3008/api",
 *   });
 *
 *   // 普通 RPC → Promise<ApiResponse>
 *   const result = await api.echo.echo({ message: "fbrpc works!" });
 *
 *   // 流式 SSE → AsyncGenerator
 *   for await (const chunk of api.echo.streamEcho({ count: 3 })) {}
 */
import type { ApiDef, Protocol, ApiResponse } from "@fbrpc/fbrpc-core";
type RpcMethod<P, K extends keyof P & string> = P[K] extends ApiDef<infer Req, infer Res> ? (req: Req) => Promise<ApiResponse<Res>> : never;
type StreamMethod<P, K extends keyof P & string> = P[K] extends ApiDef<infer Req, any> ? (req: Req) => AsyncGenerator<unknown, void, undefined> : never;
type MethodsOf<P extends Protocol, S> = [S] extends [never] ? {
    [K in keyof P & string]: RpcMethod<P, K>;
} : S extends readonly (keyof P & string)[] ? {
    [K in keyof P & string]: K extends S[number] ? StreamMethod<P, K> : RpcMethod<P, K>;
} : {
    [K in keyof P & string]: RpcMethod<P, K>;
};
export type FbrpcClient<T extends Record<string, Protocol>, S extends Record<string, readonly string[]> = {}> = {
    [M in keyof T & string]: M extends keyof S ? MethodsOf<T[M], S[M]> : MethodsOf<T[M], never>;
};
export interface ClientOptions {
    baseUrl: string;
    getHeaders?: () => Record<string, string>;
    /** 流式方法声明。key=模块名，value=方法名数组。运行时驱动 Proxy 行为。 */
    streams?: Record<string, readonly string[]>;
}
export declare function createClient<T extends Record<string, Protocol>, S extends Record<string, readonly string[]> = {}>(opts: ClientOptions): FbrpcClient<T, S>;
export {};
//# sourceMappingURL=client.d.ts.map