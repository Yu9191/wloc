// EdgeOne Pages 边缘函数: 根路径 / 的处理器。
// EdgeOne 的边缘函数(V8 运行时)不支持 npm 包, 因此直接复用零依赖的 handleRequest。
import { handleRequest } from "../src/index.js";

export async function onRequest(context) {
  return handleRequest(context.request);
}
