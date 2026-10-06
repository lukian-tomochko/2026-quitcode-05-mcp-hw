// LeadDesk MCP server over HTTP (Task E1), with Host and Origin protection against DNS rebinding.
//
//   node src/http.mjs        listens on http://127.0.0.1:3333/mcp
//
// Same factory as the stdio entry point (factory.mjs). Listens on 127.0.0.1 only, never on 0.0.0.0.
//
// The two guards must be called by hand before the handler: a `hostHeaderValidation`-style option passed to
// toNodeHandler() is silently ignored, and the server would answer 200 to a forged Host header.
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from "@modelcontextprotocol/node";
import { factory } from "./factory.mjs";

const HOST = "127.0.0.1";
const PORT = 3333;

const mcp = toNodeHandler(createMcpHandler(factory));
const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();

createServer(async (req, res) => {
  if (!checkHost(req, res)) return; // the guard has already answered 403
  if (!checkOrigin(req, res)) return;
  await mcp(req, res);
}).listen(PORT, HOST, () => {
  console.error(`[leaddesk] http server listening on http://${HOST}:${PORT}/mcp`);
});
