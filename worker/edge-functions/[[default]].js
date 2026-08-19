// EdgeOne Pages 边缘函数: 兜底 catch-all (匹配除根路径外的所有路径, 含 /api/parse)。
// 与 index.js 共用同一份零依赖处理器。
import { handleRequest } from "../src/index.js";

export async function onRequest(context) {
  return handleRequest(context.request);
}
