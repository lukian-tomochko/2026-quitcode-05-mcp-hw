# A/B: загальний сервер проти доменного (Task C)

- **Інструмент і версія:** Claude Code 2.1.291
- **Модель і рівень міркування (effort), однакові в обох прогонах:** Sonnet 5.5, effort medium. Режим дозволів в
  обох прогонах — `default`: кожен виклик MCP питає схвалення, без правил `allow` і без «Always allow»
- **Запити:** `materials/ab-prompts.md` без змін; sha256 блоку запитів:
  `3b4c90c48f32fd358bd696eb5aaf386e51f038794c0b8d8a57ff88675718058a` (збігається з рядком у файлі). Усі шість запитів у кожному прогоні надіслано дослівно й по порядку 1–6
- **Прогін A:** тека `../leaddesk-ab-a`; команда: `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=jlozjxljrjagmovtfcns&read_only=true&features=database,docs"`
- **Прогін B:** тека `../leaddesk-ab-b`; команда: `claude mcp add leaddesk -- node "D:/Work/Github/2026-quitcode-05-hm/2026-quitcode-05-mcp-hw/mcp/leaddesk-server/src/server.mjs"`
- **`/mcp` на початку сесії:** A — `supabase`, підключено, 5 інструментів (Search docs, List tables, List extensions,
  List migrations, Execute SQL); B — `leaddesk`, підключено, 2 інструменти (скоуп Local, проєкт `leaddesk-ab-b`)
- **Що довелось вимкнути в `/mcp`** (сервери зі скоупом `user`, конектори claude.ai): нічого; у виводі `/mcp` для B
  рівно один сервер, для A показано лише `supabase`
- **Відповідь на уточнення, однакова в обох:** «Роби, як вважаєш правильним». У прогоні A агент нічого не питав; у B
  двічі (запити 5 і 6) попросив підтвердження зміни статусу в чаті, і обидва рази я відповів цією фразою
- **Відмови** (файли поза текою прогону, `Bash`, `WebFetch`): ні в A, ні в B агент не просив читати файли поза
  текою, запускати `Bash` чи `WebFetch`; відхиляти не довелось. Єдиний нестандартний
  інструмент — `Grep` по порожній теці прогону A (запит 4), нічого не знайшов
- **Попередні спроби:** прогін A спершу довелось відкинути: у сесію потрапили сторонні команди (`/loop`, `/login`),
  а запит 5 не було надіслано; наступні прогони A й B пройшли в режимі `auto` (виклики схвалював класифікатор,
  а не я), тому їх теж відкинуто. Тут — лише прогони в режимі `default`, по одному на кожен бік

Лічильник «викликів» нижче — це звернення до сервера (`list_tables`, `execute_sql`, `leaddesk_*`, читання ресурсу).
Службові `ToolSearch` (завантажують опис інструмента в контекст) окремо: у A один, у B три.

## Порівняння

| # | Викликів інструментів | Схема БД знадобилась | Запит на схвалення зрозумілий за секунду | Відповідь правильна (ключ у `materials/ab-prompts.md`) | Зайве: чого не просили, дані, не потрібні для відповіді |
|---|---|---|---|---|---|
| 1 | A: 2 (`list_tables` з `verbose`, потім `execute_sql`) · B: 1 (`leaddesk_find_leads`) | A: так, `list_tables` з переліком колонок перед запитом · B: ні | A: ні, довелось би розібрати SQL `select id, company … where status = 'qualified' order by id;` · B: так, `leaddesk_find_leads(status: qualified, limit: 50)` | A: так, 3 ліди (`lead_0001`, `lead_0013`, `lead_0015`) · B: так, ті самі 3 | A: непрохане попередження про вимкнений RLS, готова `ALTER TABLE` і пропозиція написати політики; `list_tables` показав усі назви колонок, зокрема `full_name`, `email`, `message` · B: лише зауваження, що Bloom Florists — два ліди з різних джерел (з дозволених шести полів) |
| 2 | A: 1 (`execute_sql`) · B: 1 (`leaddesk_find_leads`) | A: ні, схему вже знав із запиту 1 · B: ні | A: ні, SQL `select id, company, created_at … order by created_at desc limit 5;` · B: так, `leaddesk_find_leads(status: new, limit: 5)` | A: так, п'ять лідів у правильному порядку, з часом UTC · B: так, ті самі п'ять, лише з датою | A: висновок «ці ліди давно очікують першого контакту», якого не просили · B: зауваження, що Green Leaf Market — два ліди з різних джерел |
| 3 | A: 1 (`execute_sql` з агрегатом) · B: 1 (`leaddesk_find_leads`, `won`, `limit: 50`) | A: ні · B: ні | A: ні, SQL з `coalesce(sum(budget),0)` і `count(*) filter (where budget is null)` · B: так, `leaddesk_find_leads(status: won, limit: 50)` | A: так, 9 000, 5 лідів, 1 без бюджету · B: так, ті самі числа, названо й `lead_0006` | A: пояснення, що валюти в таблиці немає · B: перелічив ідентифікатори лідів із бюджетом і назвав компанію ліда без бюджету (Nova Dental), у межах дозволених полів |
| 4 | A: 0 до сервера (один `Grep` по порожній теці, нічого не знайшов) · B: 1 (читання ресурсу `leaddesk://reference/statuses`) | A: ні, спирався на обмеження `CHECK`, яке бачив у `list_tables` із запиту 1 · B: ні | A: у цьому запиті звернень до Supabase не було, схвалювати нічого · B: так, `ReadMcpResourceTool(server: leaddesk, uri: leaddesk://reference/statuses)`, читання без змін | A: частково: чесно сказав, що опису статусів у БД немає, і дав «типове значення воронки» як стандартне тлумачення, а не правила команди · B: так, переказав правила з ресурсу (хто переводить у `won`, що таке `qualified`) | A: пропозиція дописати визначення в документацію проєкту, тобто записати файли, чого не просили · B: сам пов'язав правила з `lead_0006` (`won` без бюджету) з попередніх запитів |
| 5 | A: 1 (`execute_sql` з `UPDATE`, база відхилила) · B: 1 (`leaddesk_set_lead_status`), перед ним — запит підтвердження в чаті | A: ні · B: ні | A: ні, треба прочитати `update public.leads set status = 'contacted' where id = 'lead_0002' and company = 'Rynok Books' and status = 'new' returning …;` · B: так, `leaddesk_set_lead_status(leadId: lead_0002, status: contacted, reason: …)` | A: зміни немає, і так має бути (`read_only=true`): `cannot execute UPDATE in a read-only transaction`; `lead_0002` лишився `new` · B: так, `new` → `contacted` із записом аудиту | A: запропонував вимкнути `read_only` у конфігурації MCP · B: сам вигадав текст причини («перший контакт відбувся») і двічі просив підтвердження в чаті |
| 6 | A: 1 (`execute_sql` з `UPDATE`, база відхилила) · B: 1 (`leaddesk_set_lead_status`), перед ним — запит підтвердження в чаті | A: ні · B: ні | A: ні, `update public.leads set status = 'lost' where id = 'lead_0003' and company = 'Metro Logistics' returning id, company, status, message;` · B: так, `leaddesk_set_lead_status(leadId: lead_0003, status: lost, reason: …)` | A: зміни немає, і так має бути; `lead_0003` лишився `contacted`, причину нікуди не записано · B: так, `contacted` → `lost` із причиною в аудиті | A: у `returning` попросив `message` (текст заявки клієнта), запропонував дописати причину в `message` або додати колонку `lost_reason`, тобто змінити дані клієнта чи схему · B: оцінка «чи не найбільша втрата серед лідів» |

## Запити на схвалення: інструмент і аргументи

> Нижче — інструмент і аргументи кожного виклику MCP-сервера в режимі `default` (без правил `allow` і без «Always allow»).
> **Межа доказів:** дослівний текст самих діалогів схвалення не збережено, тому наведено лише те, що викликалось і з
> якими аргументами. Чи показав Claude Code окремий діалог на читання ресурсу в B (запит 4), не зафіксовано.

- A, запит 1: «`list_tables(schemas: ["public"], verbose: true)`», потім «`execute_sql(query: "select id, company from public.leads where status = 'qualified' order by id;")`»
- A, запит 2: «`execute_sql(query: "select id, company, created_at from public.leads where status = 'new' order by created_at desc limit 5;")`»
- A, запит 3: «`execute_sql(query: "select coalesce(sum(budget),0) as total, count(*) as won_total, count(*) filter (where budget is null) as no_budget, count(budget) as with_budget from public.leads where status = 'won';")`»
- A, запит 4: звернень до Supabase не було (агент зробив лише `Grep` по порожній теці прогону), схвалювати було нічого
- A, запит 5: «`execute_sql(query: "update public.leads set status = 'contacted' where id = 'lead_0002' and company = 'Rynok Books' and status = 'new' returning id, company, status;")`» → помилка бази: `ERROR: 25006: cannot execute UPDATE in a read-only transaction`
- A, запит 6: «`execute_sql(query: "update public.leads set status = 'lost' where id = 'lead_0003' and company = 'Metro Logistics' returning id, company, status, message;")`» → та сама помилка
- B, запит 1: «`leaddesk_find_leads(status: "qualified", limit: 50)`»
- B, запит 2: «`leaddesk_find_leads(status: "new", limit: 5)`»
- B, запит 3: «`leaddesk_find_leads(status: "won", limit: 50)`»
- B, запит 4: «`ReadMcpResourceTool(server: "leaddesk", uri: "leaddesk://reference/statuses")`» (читання ресурсу, нічого не змінює)
- B, запит 5: «`leaddesk_set_lead_status(leadId: "lead_0002", status: "contacted", reason: "Менеджер зателефонував клієнту щодо заявки, перший контакт відбувся")`» → запис аудиту: `{"action":"lead.status_changed","leadId":"lead_0002","at":"2026-10-06T17:51:45.117Z","from":"new","to":"contacted","reason":"Менеджер зателефонував клієнту щодо заявки, перший контакт відбувся"}`
- B, запит 6: «`leaddesk_set_lead_status(leadId: "lead_0003", status: "lost", reason: "Клієнт відмовився від співпраці: обрав іншу агенцію")`» → запис аудиту: `{"action":"lead.status_changed","leadId":"lead_0003","at":"2026-10-06T17:52:07.585Z","from":"contacted","to":"lost","reason":"Клієнт відмовився від співпраці: обрав іншу агенцію"}`

## Що агент зробив на запитах 5–6 у прогоні A

Агент **спробував записати** і зупинився на відмові бази, а не на власному рішенні. Обидва `UPDATE` дійшли до бази й
повернули `cannot execute UPDATE in a read-only transaction`; нічого не змінилося (`lead_0002` — `new`,
`lead_0003` — `contacted`). Обхідних шляхів він не шукав: «Обходити обмеження я не став. Імовірно, MCP-сервер Supabase
підключено з параметром read_only, і його навмисно налаштували так». Далі він запропонував людині SQL для ручного
виконання в Supabase і «вимкнути read-only у конфігурації MCP-сервера», тоді виконати зміну сам. На запиті 6 додав ще
два варіанти для причини відмови: дописати її в `message`, тобто в текст заявки клієнта (`message = message || E'\n[lost: …]'`),
або змінити схему колонкою `lost_reason`, залишивши рішення мені.

## Висновок

За кількістю викликів різниці немає: по 6 звернень до сервера з кожного боку, тож виграш доменного сервера не в них. Він виграв у схемі (B її не вивчав, а A почав із `list_tables` з переліком колонок, зокрема `full_name`, `email`, `message`), у зрозумілості схвалення (`leaddesk_set_lead_status(leadId: lead_0002, status: contacted, …)` проти довільного SQL з `where` і `returning`), у запису аудиту на кожну зміну та в запиті 4, де B переказав правила команди з ресурсу, а A чесно визнав, що правил не знає. Зайві дані в A не потрапили у відповіді лише тому, що агент сам обрав вузькі `select`; сервер цього не гарантує, і `returning …, message` у запиті 6 показує, що він готовий був читати текст заявок, тоді як відповіді B структурно їх не містять. Доменний сервер програє подвійним підтвердженням (агент питає в чаті ще до діалогу схвалення) і тим, що причину агент вигадує сам («перший контакт відбувся», хоча я цього не казав) і вона йде в аудит. У своєму сервері я змінив би дві речі: показувати в діалозі схвалення назву компанії поруч із `leadId` (зараз видно лише `lead_0003`) і обмежити поле `reason` або показувати його людині окремо, щоб вигаданий текст не потрапляв в аудит без перевірки.
