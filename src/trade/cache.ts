import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 极简磁盘 JSON 缓存（带 TTL）。
 * 默认目录 .cache（相对于进程 cwd），可通过构造参数覆盖。
 */
export class DiskCache {
  private dir: string;

  constructor(dir = join(process.cwd(), ".cache")) {
    this.dir = dir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** 键 → 文件名的稳定哈希（sha1），避免非法文件名字符。 */
  private fileName(key: string): string {
    return createHash("sha1").update(key).digest("hex") + ".json";
  }

  get<T>(key: string): T | null {
    try {
      const file = join(this.dir, this.fileName(key));
      if (!existsSync(file)) return null;
      const raw = JSON.parse(readFileSync(file, "utf8")) as { expires: number; value: T };
      if (raw.expires < Date.now()) return null;
      return raw.value;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, ttlMs = 300_000): void {
    try {
      const file = join(this.dir, this.fileName(key));
      if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ expires: Date.now() + ttlMs, value }));
    } catch {
      // 缓存写失败不应影响主流程
    }
  }
}
