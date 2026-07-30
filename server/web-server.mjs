import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 8080);
const distRoot = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const geminiKey = process.env.GEMINI_API_KEY;
const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function proxyGemini(request, response) {
  if (!geminiKey) return sendJson(response, 503, { error: { message: "GEMINI_API_KEY não configurada no servidor." } });
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) return sendJson(response, 413, { error: { message: "Requisição muito grande." } });
  }
  try {
    JSON.parse(body);
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body
    });
    response.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(await upstream.text());
  } catch {
    sendJson(response, 400, { error: { message: "Requisição inválida." } });
  }
}

function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let filePath = resolve(distRoot, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(`${distRoot}${sep}`) && filePath !== distRoot) {
    response.writeHead(403);
    return response.end();
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = resolve(distRoot, "index.html");
  const extension = extname(filePath);
  const immutable = filePath.includes(`${sep}_expo${sep}static${sep}`);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : extension === ".html" || filePath.endsWith("service-worker.js") ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/health") return sendJson(response, 200, { status: "ok" });
  if (url.pathname === "/api/gemini" && request.method === "POST") return proxyGemini(request, response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    return response.end();
  }
  serveStatic(url.pathname, response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Nenero web rodando na porta ${port}`);
});
