// 注册 .js→.ts 相对导入映射钩子（配合 node --experimental-strip-types 使用）
import { register } from "node:module";

register(new URL("./ts-import-hook.mjs", import.meta.url), import.meta.url);
