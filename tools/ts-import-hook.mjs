// resolve 钩子：相对路径 .js 导入在 .js 文件不存在时映射到同名 .ts 文件
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    specifier.endsWith(".js")
  ) {
    const tsSpec = specifier.slice(0, -3) + ".ts";
    try {
      return await nextResolve(tsSpec, context);
    } catch {
      // .ts 不存在时按原样解析（让默认错误自然抛出）
    }
  }
  return nextResolve(specifier, context);
}
