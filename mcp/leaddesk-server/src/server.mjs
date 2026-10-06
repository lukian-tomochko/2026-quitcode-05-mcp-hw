// LeadDesk MCP server, stdio entry point. The server itself is in factory.mjs (shared with http.mjs).
//
//   node src/server.mjs                              fixture: fixtures/leads.json (20 synthetic leads)
//   LEADDESK_FIXTURE=/path/to/leads.json node ...    another fixture file
//
// stdout is the protocol channel, so everything that is logged goes to stderr (see factory.mjs).
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { factory } from "./factory.mjs";

await serveStdio(factory);
