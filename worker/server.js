import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import app from "./src/index.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const publicFiles = new Map([
  ["/dist/wloc.js", "dist/wloc.js"],
  ["/dist/wloc-settings.js", "dist/wloc-settings.js"],
  ["/modules/wloc.conf", "modules/wloc.conf"],
  ["/modules/wloc.lpx", "modules/wloc.lpx"],
  ["/modules/wloc.module", "modules/wloc.module"],
  ["/modules/wloc.sgmodule", "modules/wloc.sgmodule"],
  ["/modules/wloc.stoverride", "modules/wloc.stoverride"],
  ["/wloc.jpg", "wloc.jpg"],
]);

const contentTypes = new Map([
  [".conf", "text/plain;charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript;charset=utf-8"],
  [".lpx", "text/plain;charset=utf-8"],
  [".module", "text/plain;charset=utf-8"],
  [".sgmodule", "text/plain;charset=utf-8"],
  [".stoverride", "text/plain;charset=utf-8"],
]);

function getRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getRequestUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
  const hostHeader = req.headers.host || `${host}:${port}`;
  return `${proto}://${hostHeader}${req.url || "/"}`;
}

function getForwardedPrefix(headers) {
  const rawPrefix = headers.get("x-forwarded-prefix") || "";
  const prefix = rawPrefix.replace(/\/+$/g, "");
  if (!prefix) return "";
  return prefix.startsWith("/") ? prefix : `/${prefix}`;
}

function rewriteModuleUrls(body, publicBaseUrl) {
  return body
    .replaceAll("https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/dist/wloc.js", `${publicBaseUrl}/dist/wloc.js`)
    .replaceAll(
      "https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/dist/wloc-settings.js",
      `${publicBaseUrl}/dist/wloc-settings.js`
    )
    .replaceAll("https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/wloc.jpg", `${publicBaseUrl}/wloc.jpg`)
    .replaceAll("https://wloc-pages.pages.dev/", `${publicBaseUrl}/`);
}

async function servePublicFile(url, headers) {
  const relativePath = publicFiles.get(url.pathname);
  if (!relativePath) return null;

  const filePath = resolve(repoRoot, relativePath);
  let body = await readFile(filePath);
  if (url.pathname.startsWith("/modules/")) {
    body = rewriteModuleUrls(body.toString("utf8"), `${url.origin}${getForwardedPrefix(headers)}`);
  }

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes.get(extname(url.pathname)) || "application/octet-stream",
    },
  });
}

function getRequestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (response.body === null) {
    res.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const headers = getRequestHeaders(req);
    const url = new URL(getRequestUrl(req));
    const publicResponse = await servePublicFile(url, headers);
    if (publicResponse) {
      await sendResponse(res, publicResponse);
      return;
    }

    const request = new Request(getRequestUrl(req), {
      method: req.method,
      headers,
      body: await getRequestBody(req),
    });

    await sendResponse(res, await app.fetch(request));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain;charset=utf-8");
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log(`WLOC self-host server listening on http://${host}:${port}`);
});
