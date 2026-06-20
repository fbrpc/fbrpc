/**
 * fbrpc 错误类型。
 * handler 内部 throw RpcError 时，框架自动转为统一错误响应。
 */
export class RpcError extends Error {
    code;
    constructor(message, code = "API_ERROR") {
        super(message);
        this.code = code;
        this.name = "RpcError";
    }
}
/**
 * 解包 ApiResponse，失败自动 throw RpcError。
 *
 * const token = unwrap(await api.auth.login(req)).accessToken;
 */
export function unwrap(r) {
    if (r.ok)
        return r.data;
    throw new RpcError(r.error.message, r.error.code);
}
//# sourceMappingURL=errors.js.map