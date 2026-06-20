/**
 * 文件系统扫描器 — 按约定发现服务模块。
 *
 * 约定: services/<name>/api.ts 导出 { handlers?, streams? }
 * 扫描结果直接用于路由注册。
 */
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ApiModule } from "@birderr/fbrpc-core";

export interface ScanResult {
  /** 模块名 → ApiModule */
  [moduleName: string]: ApiModule;
}

/**
 * 扫描 apiDir 下所有 services/<name>/api.ts。
 * 模块名取自目录名（如 services/auth/api.ts → "auth"）。
 */
export async function scanModules(apiDir: string): Promise<ScanResult> {
  const result: ScanResult = {};

  // 1. 列出 apiDir 下所有条目
  let entries: Dirent[];
  try {
    entries = await readdir(apiDir, { withFileTypes: true });
  } catch {
    // apiDir 不存在 → 空结果
    return result;
  }

  // 2. 逐个检查是否有 api.ts
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleName = entry.name;
    const apiPath = pathToFileURL(`${apiDir}/${moduleName}/api.ts`).href;

    let mod: Record<string, unknown>;
    try {
      mod = (await import(apiPath)) as Record<string, unknown>;
    } catch {
      // api.ts 不存在或无法加载 → 跳过
      continue;
    }

    // 3. 提取 handlers 和 streams
    const handlers = (mod.handlers ?? {}) as ApiModule["handlers"];
    const streams = (mod.streams ?? {}) as ApiModule["streams"];

    if (Object.keys(handlers).length === 0 && Object.keys(streams).length === 0) {
      continue; // 空模块，跳过
    }

    result[moduleName] = { handlers, streams };
  }

  return result;
}
