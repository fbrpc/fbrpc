/**
 * Fastify 路由注册器 — 将扫描到的模块注册为 HTTP 端点。
 *
 * 路由规则:
 *   POST /prefix/module/method
 *     调用 services/module/api.ts 中的 handlers[methodName]
 *
 * 流式规则:
 *   POST /prefix/module/method
 *     调用 services/module/api.ts 中的 streams[methodName]
 *     响应: text/event-stream (SSE)
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
export interface RouterOptions {
    /** services 目录绝对路径。扫描 services 下各模块的 api.ts。 */
    apiDir: string;
    /** 鉴权函数。返回 null → 401。返回对象注入 call.meta。 */
    auth?: (req: FastifyRequest) => Record<string, unknown> | null;
    /** 跳过鉴权的路由。支持 "模块.方法" 和 "模块.*" 通配。 */
    publicRoutes?: string[];
    /** CORS。false=不设头，true=*，{ origin }=指定来源。默认 false。 */
    cors?: boolean | {
        origin?: string;
    };
    /** 请求超时（毫秒）。默认不设。 */
    timeout?: number;
}
export interface FbrpcRouter {
    register: (app: FastifyInstance, opts?: {
        prefix?: string;
    }) => Promise<void>;
}
export declare function createRouter(opts: RouterOptions): Promise<FbrpcRouter>;
//# sourceMappingURL=router.d.ts.map