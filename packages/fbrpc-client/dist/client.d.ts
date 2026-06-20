/**
 * fbrpc 类型安全客户端 — Proxy 驱动。
 *
 * 用法:
 *   const api = createClient<{ auth: AuthProtocol }>("http://localhost:3008/api");
 *   const result = await api.auth.login({ username: "foo", password: "bar" });
 *   // result: { ok: true; data: { accessToken, refreshToken } }
 *   //       | { ok: false; error: { message, code } }
 */
import type { ApiDef, Protocol, ReqOf, ResOf, ApiResponse } from "@birderr/fbrpc-core";
/** 将 Protocol 映射为可调用方法 */
type ProtocolClient<P extends Protocol> = {
    [K in keyof P & string]: P[K] extends ApiDef ? (req: ReqOf<P[K]>) => Promise<ApiResponse<ResOf<P[K]>>> : never;
};
/** 将模块映射表映射为嵌套客户端 */
export type FbrpcClient<T extends Record<string, Protocol>> = {
    [Module in keyof T & string]: ProtocolClient<T[Module]>;
};
export interface ClientOptions {
    /** 服务端 base URL */
    baseUrl: string;
    /**
     * 每次请求前调用，返回要附加的 HTTP headers。
     * 典型用法：返回 { Authorization: `Bearer ${getToken()}` }
     */
    getHeaders?: () => Record<string, string>;
}
export declare function createClient<T extends Record<string, Protocol>>(opts: ClientOptions): FbrpcClient<T>;
export {};
//# sourceMappingURL=client.d.ts.map