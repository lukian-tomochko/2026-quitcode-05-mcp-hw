# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code 2.1.289 · Claude Sonnet 5.5
- **ОС і термінал, Node:** Windows 11 Home · Git Bash (артефакти Inspector'а) · Node v22.21.0 · npm 10.9.4

## Task A — сервер в Inspector

- **Команди, якими зроблено чотири файли в `docs/mcp/`:** рівно ті, що в walkthrough (Task A, крок 4),
  з кореня репозиторію в Git Bash, `npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs …`:
  `--method tools/list` → `tools-list.json`; `--method tools/call --tool-name leaddesk_set_lead_status`
  (`leadId=lead_0002`, `status=contacted`) → `set-status.json`; той самий інструмент із `leadId=nope`
  → `bad-input.json`; `--method resources/read --uri leaddesk://reference/statuses` → `resource-read.json`.
  Перед цим я прогнав усі шляхи сервера окремо (список, успіх, «той самий статус», невідомий лід) — вивід
  лишився поза репозиторієм.
- **`tools-list.json`:** рівно два інструменти. `leaddesk_find_leads` — `{"readOnlyHint":true}`,
  `leaddesk_set_lead_status` — `{"readOnlyHint":false}`. У кожного з п'яти параметрів є `description`
  (саме його бачить модель); `status` у пошуку — enum із шести значень (п'ять статусів і `any`),
  `limit` — ціле 1–50, за замовчуванням 10, `leadId` — патерн `^lead_\d{4}$`, `reason` — 3–500 символів.
  В описі `leaddesk_set_lead_status` прямо сказано, що він змінює дані й потребує підтвердження людини.
- **`bad-input.json`:** ламав `leaddesk_set_lead_status` аргументами `leadId=nope`, `reason=ok`.
  `"isError": true`, текст валідації містить **дві** причини: `leadId: … must match pattern /^lead_\d{4}$/`
  і `reason: Too small: expected string to have >=3 characters` (`ok` — лише 2 символи). Код виходу Inspector:
  **`exit=5`**; у stderr — `{"error":{"code":"tool_is_error",…}}`. Перевірка форми працює до обробника,
  тож сервер не бачить ні неіснуючого id, ні надто короткої причини.
- **`set-status.json`:** лід `lead_0002` (Rynok Books), `new` → `contacted`. Запис аудиту в
  `structuredContent.audit`: `{ "action": "lead.status_changed", "leadId": "lead_0002", "at": "2026-10-04T11:40:08.737Z", "from": "new", "to": "contacted", "reason": "перевірка в Inspector" }`.
  У `structuredContent.lead` — лише `id`, `company`, `status`, `source`, `budget`, `createdAt`:
  ні імені, ні email, ні тексту заявки.
- **Ресурс (`resource-read.json`):** `leaddesk://reference/statuses`, `"mimeType": "text/markdown"`.
- **Самоперевірка:** `grep -rc 'console\.log' mcp/leaddesk-server/src` → `0`; `cmp materials/leads.json
  mcp/leaddesk-server/fixtures/leads.json` → ідентичні; усі чотири JSON — валідний UTF-8 без BOM, без
  рядків stderr; `@modelcontextprotocol/sdk` у `package.json` немає; `git status` без змін у кореневих
  `package.json` і `package-lock.json`.
- **Що було найважче в описах інструментів і параметрів:**
  - Дві помилки, які агент мусить розрізняти, повертаються з різних шарів: невідповідність формату
    (`nope`, `lead_999`) відсікає схема ще до обробника, а «формат правильний, але ліда немає» і «статус
    уже такий» — це `isError` із самого обробника з підказкою `leaddesk_find_leads`. Підказку в тексті
    помилки пишемо лише там, де ми її контролюємо.
  - `budget` у фікстурі буває `null`, а сама фікстура не відсортована за `createdAt`: «найновіші першими»
    сервер забезпечує сортуванням, а не порядком у файлі.
  - Опис `leaddesk_set_lead_status` мав одночасно попередити про зміну даних і сказати, що без
    підтвердження людини його не викликають — але дозвіл усе одно дає саме людина, а не опис.
  - Текст ресурсу зі статусами — це правила, які я придумав для «нашої команди» (хто переводить у `won`,
    що таке `qualified`); у реальному проєкті їх треба узгодити з командою, бо агент читатиме їх як факт.

## Task B — що зробили агенти з серверами

- **Supabase:** сесія лише з `supabase` (9 інструментів у `/mcp`). Агент спершу записав
  `supabase/migrations/0001_leaddesk.sql` і `supabase/seed/leads.sql`, нічого не застосовуючи, і попросив
  дозволу: пояснив, що змінить кожен виклик, і спитав, чи проєкт одноразовий. Лише після мого «так» у чаті
  виконав `apply_migration` і `execute_sql` (insert на 20 рядків). Далі: `select count(*) from leads` → 20;
  `select current_user, session_user, current_setting('is_superuser')` → `postgres`, `postgres`, `off`.
  Агент сам зазначив, що роль `postgres` має широкі права на схему `public`, а таблиця без RLS доступна через
  публічний API. Агент назвав колонки в snake_case
  (`full_name`, `created_at`) і спитав, чи так лишати — я залишив.
- **Vercel:** проєкт підключено до форка через git-інтеграцію в дашборді Vercel (не через MCP і не через
  CLI); деплой `main`, production, `READY`. Перша спроба агента — `list_deployments` — дала `403 Forbidden`:
  токен MCP авторизовано на інший скоуп, ніж той, де лежить проєкт, і агент **зупинився**, не підбираючи
  інші токени чи скоупи, а прямо спитав, чи це мій особистий акаунт. Я перевірив, що команда має лише
  одного учасника (мене), знову пройшов вхід і обрав цей скоуп. Друга спроба дала лог збірки: Next.js 16.3.5
  (Turbopack), `Build Completed in /vercel/output [36s]`; збережено в
  `docs/mcp/evidence/vercel-build-log.txt`. Файл перевірено на назву команди, id проєкту й деплою: їх немає.
  У `/mcp` видно 244 інструменти. Ім'я конкретного інструмента, яким прочитано лог, у транскрипті я не
  зафіксував.
- **Figma:** `whoami` — план Starter, місце Full, власна команда (особистий акаунт); цей виклик у ліміт не
  рахується. Токени — з власного файлу, фрейм `node-id=1-2`, інструмент `get_variable_defs`:
  `docs/mcp/evidence/figma-tokens.json` — три колір-змінні. Назви мають вигляд `brand/brand/primary`,
  бо колекція змінних теж зветься `brand`; стиль тексту `Heading/H1` у відповідь не потрапив, бо
  `get_variable_defs` віддає лише змінні. Усього витрачено 2 виклики з 20 на місяць.
- **Playwright:** не використовували (обрано Figma).
- **Що агент зробив сам, без прохання:**
  - Vercel: сам звернувся до списку проєктів, щоб знайти потрібний, і на 403 не став обходити відмову.
  - Figma: на прохання «whoami» без уточнення агент спершу виконав оболонкову `whoami` (повернула ім'я
    користувача Windows), а інструмент Figma викликав лише після прямої вказівки; після deny агент ще
    перелічив у відповіді інструменти, які згадуються в інструкціях сервера, але недоступні: інструкції
    сервера описують і ті можливості, що ми вимкнули.
  - Збій з'єднання: між знімками `/mcp` двічі відповів, що не може перепідключити figma (`ENOTFOUND`,
    потім `Version negotiation probe timed out`). Причиною був DNS на моїй машині (резолвінг падав для всіх
    хостів), а не конфіг. Після виправлення мережі я перепідключив сервер, і лише тоді зняв знімок «після»:
    інакше агент перелічив би нуль інструментів, і різниця «до/після» була б хибною.

## Task E (бонус)

- **Варіант:** E1, власний сервер по HTTP із захистом Host/Origin. E2 і E3 не робив.
- **Що змінено в коді.** Додано `mcp/leaddesk-server/src/http.mjs`. Щоб він і `server.mjs` ділили одну фабрику, її
  перенесено в `src/factory.mjs`: `server.mjs` тепер лише `serveStdio(factory)`, бо імпорт старого `server.mjs`
  запускав би stdio. У `package.json` сервера додано `"@modelcontextprotocol/node": "2.1.0"` (точна версія; виняток із
  правила «лише `server` і `zod`», дозволений для E1). Кореневі `package.json` і `package-lock.json` не змінилися.
- **Рефакторинг нічого не зламав у stdio.** Я заново зняв артефакти Task A тими самими командами Inspector'а:
  `tools-list.json`, `resource-read.json` і `bad-input.json` збігаються з закомічними побайтово (`cmp`), у
  `set-status.json` відрізняються лише часові мітки; `bad-input` знову дає `exit=5`; `console.log` у `src/` — 0.
- **Сервер слухає лише `127.0.0.1:3333`.** Гварди `localhostHostValidation()` і `localhostOriginValidation()` викликаються
  вручну перед обробником (`if (!checkHost(req, res)) return;`). Опція в `toNodeHandler` мовчки ігнорується.
- **Чотири відповіді `curl`** (Git Bash, тіло запиту `body.json` у тимчасовій теці поза репозиторієм, у git його немає):
  1. звичайний запит → **HTTP 200**, у відповіді інструменти `leaddesk_find_leads` і `leaddesk_set_lead_status`;
  2. `-H "Host: evil.example"` → **HTTP 403**, `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}`;
  3. `-H "Origin: https://evil.example"` → **HTTP 403**, `…"message":"Invalid Origin: evil.example"…`;
  4. без заголовка `MCP-Protocol-Version` → **HTTP 400**, код **-32020** («the request headers and body disagree: … the
     required MCP-Protocol-Version header is absent»).
- **Контрольний дослід без гвардів.** Я окремо підняв такий самий обробник на порту 3334 без жодного гварда (тимчасовий
  скрипт поза репозиторієм). Підроблений `Host: evil.example` і підроблений `Origin: https://evil.example` обидва дали
  **HTTP 200**. Тобто 403 у пунктах 2–3 дають саме ручні гварди, а не сам обробник. Обидва сервери після перевірки зупинено,
  порти вільні.
- **`npm run lint` і `npm run build`** проходять після додавання нових файлів (обидва `exit=0`): `.mjs` під `mcp/` збірку
  застосунку не зачіпають.
- **Обмеження:** це лише захист від DNS rebinding і чужого Origin для локального сервера. Автентифікації в сервера
  немає, тож його не можна слухати на `0.0.0.0` чи виставляти в мережу; стан і аудит, як і раніше, лише в пам'яті процесу.
