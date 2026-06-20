import type { ApiModule } from "@birderrr/fbrpc-core";
export interface ScanResult {
    /** 模块名 → ApiModule */
    [moduleName: string]: ApiModule;
}
/**
 * 扫描 apiDir 下所有 services/<name>/api.ts。
 * 模块名取自目录名（如 services/auth/api.ts → "auth"）。
 */
export declare function scanModules(apiDir: string): Promise<ScanResult>;
//# sourceMappingURL=scanner.d.ts.map