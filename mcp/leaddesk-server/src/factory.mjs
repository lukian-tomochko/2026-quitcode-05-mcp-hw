// LeadDesk as an MCP server: two business verbs instead of SQL over the whole database.
// The server factory shared by both entry points: server.mjs (stdio) and http.mjs (HTTP).
//
//   LEADDESK_FIXTURE=/path/to/leads.json node ...    another fixture file than fixtures/leads.json
//
// The fixture is read once; every change lives in the memory of this process and is gone on restart.
// The file is never written. stdout is the protocol channel of the stdio entry point, so the log goes
// to stderr only — and never contains names, e-mails or the text of a lead's request.
import { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Same vocabulary as LEAD_STATUSES in lib/types.ts.
const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];

const FIXTURE = process.env.LEADDESK_FIXTURE ?? fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// The only fields an agent gets for these two verbs. Name, e-mail and the text of the request stay here.
const publicLead = ({ id, company, status, source, budget, createdAt }) => ({ id, company, status, source, budget, createdAt });

let leads;
try {
  leads = new Map(JSON.parse(await readFile(FIXTURE, "utf8")).map((lead) => [lead.id, lead]));
} catch (e) {
  console.error(`[leaddesk] cannot load fixture: ${e.message}`);
  process.exit(1);
}
console.error(`[leaddesk] ${leads.size} leads loaded into memory`);

// One entry per successful status change; same shape as AuditEntry in lib/types.ts
// ({ action, leadId, at }) plus what changed and why.
const audit = [];

const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });

const STATUSES_MD = `# Статуси лідів LeadDesk

П'ять статусів — і більше жодних. Агент не вигадує власних і не переводить лід «навмання»: якщо умов
нижче не виконано, він лишає статус як є й питає людину.

| Статус | Що означає для нашої команди |
|---|---|
| \`new\` | Заявка прийшла з форми чи кампанії, ніхто з команди ще не зв'язувався з клієнтом. Початковий статус кожного ліда. |
| \`contacted\` | Менеджер вже говорив із клієнтом: був дзвінок або надіслано персональний лист і є відповідь чи зафіксована спроба. Просте «автовідповідь надіслано» — це ще \`new\`. |
| \`qualified\` | Після розмови відомі потреба, орієнтовний бюджет і термін, а контакт має право вирішувати. Без названого бюджету лід не кваліфікуємо. |
| \`won\` | Клієнт підтвердив співпрацю: підписано договір або отримано передоплату. Переводить у \`won\` лише власник (owner), не менеджер. |
| \`lost\` | Клієнт відмовився, або після трьох спроб зв'язку за 14 днів відповіді немає. У \`reason\` завжди пишемо причину. |

## Правила зміни

- Кожна зміна статусу — це запис в аудиті з причиною (\`reason\`, 3–500 символів). Причину пишемо по суті: «клієнт підтвердив бюджет 3000 USD у дзвінку», а не «ок».
- Зазвичай статус рухається вперед: \`new\` → \`contacted\` → \`qualified\` → \`won\`. \`lost\` можливий з будь-якого статусу.
- Повернення з \`lost\` у роботу — лише за прямою вказівкою людини.
- Перед викликом \`leaddesk_set_lead_status\` агент називає людині лід, новий статус і причину та чекає підтвердження.
`;

export const factory = () => {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" });

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди за статусом",
      description:
        "Повертає ліди LeadDesk із заданим статусом, найновіші першими. Для кожного ліда — лише id, company, status, source, budget, createdAt: без імені, email і тексту заявки. Застосовуй, щоб побачити, хто в роботі, і дізнатися id ліда перед зміною статусу. Тільки читає. Що означає кожен статус — у ресурсі leaddesk://reference/statuses.",
      inputSchema: {
        status: z
          .enum([...LEAD_STATUSES, "any"])
          .describe("Який статус шукати: new, contacted, qualified, won або lost. any — ліди з будь-яким статусом"),
        limit: z.number().int().min(1).max(50).default(10).describe("Скільки лідів повернути, від 1 до 50. За замовчуванням 10"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit = 10 }) => {
      const found = [...leads.values()]
        .filter((lead) => status === "any" || lead.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(publicLead);

      const label = status === "any" ? "будь-яким статусом" : `статусом ${status}`;
      const lines = found.map((l) => `- ${l.id} · ${l.company} · ${l.status} · ${l.source} · бюджет ${l.budget ?? "не вказано"} · ${l.createdAt}`);
      return {
        content: [{ type: "text", text: found.length ? `Лідів із ${label}: ${found.length}\n${lines.join("\n")}` : `Лідів із ${label} немає.` }],
        structuredContent: { leads: found },
      };
    },
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда",
      description:
        "ЗМІНЮЄ ДАНІ: переводить один лід в інший статус і пише запис в аудит. Перед викликом назви людині лід, новий статус і причину та дочекайся її підтвердження в чаті. Не викликай самостійно. Не вгадуй id: знайди його через leaddesk_find_leads. Той самий статус, що вже є, — помилка. Коли який статус доречний — у ресурсі leaddesk://reference/statuses.",
      inputSchema: {
        leadId: z.string().regex(/^lead_\d{4}$/).describe("Ідентифікатор ліда, наприклад lead_0002"),
        status: z.enum(LEAD_STATUSES).describe("Новий статус: new, contacted, qualified, won або lost"),
        reason: z.string().min(3).max(500).describe("Чому змінюємо статус, від 3 до 500 символів. Це потрапляє в аудит"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ leadId, status, reason }) => {
      const lead = leads.get(leadId);
      if (!lead) {
        return fail(`Ліда ${leadId} немає. Знайди правильний id через leaddesk_find_leads.`);
      }
      if (lead.status === status) {
        return fail(`Лід ${leadId} уже має статус ${status}: нічого не змінено.`);
      }

      const from = lead.status;
      lead.status = status;
      const entry = { action: "lead.status_changed", leadId, at: new Date().toISOString(), from, to: status, reason };
      audit.push(entry);
      console.error(`[leaddesk] ${leadId}: ${from} -> ${status} (audit entries: ${audit.length})`);

      return {
        content: [{ type: "text", text: `Статус ${leadId} змінено: ${from} → ${status}. Запис в аудиті створено (${entry.at}).` }],
        structuredContent: { lead: publicLead(lead), audit: entry },
      };
    },
  );

  server.registerResource(
    "lead-statuses",
    "leaddesk://reference/statuses",
    {
      title: "Статуси лідів",
      description: "П'ять статусів лідів і що кожен означає для нашої команди: коли лід стає contacted, що потрібно для qualified, хто переводить у won",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: STATUSES_MD }] }),
  );

  return server;
};
