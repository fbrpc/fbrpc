import type { ApiResponse } from "./types.js";
/**
 * fbrpc 错误类型。
 * handler 内部 throw RpcError 时，框架自动转为统一错误响应。
 */
export declare class RpcError extends Error {
    code: string;
    constructor(message: string, code?: string);
}
/**
 * 解包 ApiResponse，失败自动 throw RpcError。
 *
 * const token = unwrap(await api.auth.login(req)).accessToken;
 */
export declare function unwrap<T>(r: ApiResponse<T>): T;
//# sourceMappingURL=errors.d.ts.map