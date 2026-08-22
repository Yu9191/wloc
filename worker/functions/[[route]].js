// Cloudflare Pages Functions 适配器。
// 平台把每个请求封装成 context, 我们取出标准 Request 交给平台无关的处理器。
import { handleRequest } from "../src/index.js";

export const onRequest = (context) => handleRequest(context.request);
