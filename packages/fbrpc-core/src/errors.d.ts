/**
 * fbrpc 错误类型。
 * handler 内部 throw RpcError 时，框架自动转为统一错误响应。
 */
export declare class RpcError extends Error {
    code: string;
    constructor(message: string, code?: string);
}
//# sourceMappingURL=errors.d.ts.map