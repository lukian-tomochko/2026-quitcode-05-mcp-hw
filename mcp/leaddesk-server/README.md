# LeadDesk MCP server

Domain MCP server (stdio) for LeadDesk: two business verbs and one reference resource instead of SQL
over the whole database.

| Name | What it does | Annotations |
|---|---|---|
| `leaddesk_find_leads` | leads by status (`new`, `contacted`, `qualified`, `won`, `lost`, `any`), newest first; returns only `id`, `company`, `status`, `source`, `budget`, `createdAt` | `readOnlyHint: true` |
| `leaddesk_set_lead_status` | changes one lead's status and writes an audit entry `{ action, leadId, at, from, to, reason }` | `readOnlyHint: false` |
| `leaddesk://reference/statuses` | `text/markdown`: what each of the five statuses means for the team | — |

Data comes from `fixtures/leads.json` (an unchanged copy of `materials/leads.json`, 20 synthetic leads).
It is read once at start; status changes and audit entries live **in the memory of the process** and
are gone on restart. The fixture file is never written.

## Run

```bash
cd mcp/leaddesk-server
npm install
node src/server.mjs        # waits for MCP messages on stdin; the log goes to stderr
```

`LEADDESK_FIXTURE=/path/to/leads.json` points the server at another fixture file.
Do not use `console.log` in `src/`: stdout is the protocol channel.

## Run over HTTP (optional, Task E1)

```bash
node src/http.mjs          # http://127.0.0.1:3333/mcp, loopback only
```

`src/http.mjs` uses the same factory (`src/factory.mjs`) as the stdio entry point. It calls
`localhostHostValidation()` and `localhostOriginValidation()` itself before the handler: a forged `Host` or
`Origin` gets 403. There is no authentication, so never bind it to anything but `127.0.0.1`.
This mode needs `@modelcontextprotocol/node` (pinned in `package.json`).

## Check with MCP Inspector

From the repository root (Git Bash). Every call starts the server anew, so the state is clean each time.

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_find_leads --tool-arg status=new --tool-arg limit=3
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses
```

A call that returns `isError: true` makes Inspector exit with code 5 — that is expected.
Saved results: `docs/mcp/*.json`.

## Connect to Claude Code

Use scope `local` (the default) from an empty folder outside the repository, as in Task C:

```bash
REPO="$(pwd -W)"   # run from the repository root; on macOS/Linux: REPO="$(pwd)"
mkdir ../leaddesk-ab-b && cd ../leaddesk-ab-b
claude mcp add leaddesk -- node "$REPO/mcp/leaddesk-server/src/server.mjs"
```

The path to the server stays in `~/.claude.json`; nothing goes into git. No environment variables
or secrets are needed.
