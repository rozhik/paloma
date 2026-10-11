# Immich API ↔ Paloma API — порівняння

> Знімок на **2026-10-10**. Immich: OpenAPI **3.3.0-rc.0** (`immich-openapi-specs.json`, ~279 операцій).  
> Paloma: Express router у `server/src/routes/index.ts` + типи в `shared/types.ts` (без OpenAPI).  
> Джерела Immich: [документація API](https://docs.immich.app/api), [інтерактивні ендпоінти](https://api.immich.app/endpoints), [специфікація на GitHub](https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json).

Це **невизначена пропозиція / референс**, не контракт Paloma (див. `AGENTS.md`).  
Продуктова модель файлів, папок і дублікатів Immich: [08-immich-files-folders-duplicates.md](08-immich-files-folders-duplicates.md).

---

## 1. Короткий вердикт

| | **Immich** | **Paloma** |
| :--- | :--- | :--- |
| **Роль продукту** | Self-hosted фото/відео з мобільним бекапом, мультикористувачем, шерингом | Локальний desktop-орієнтований менеджер у дусі Picasa (senior-friendly) |
| **Масштаб API** | Повний продуктний HTTP API (~279 ops, OpenAPI + SDK) | Тонкий локальний REST (~45 маршрутів) під один UI |
| **Auth** | Bearer / cookie / `x-api-key`, користувачі, OAuth, PIN-сесії | Немає — довіра до localhost/процесу |
| **Контракт** | OpenAPI → TypeScript/Dart SDK | `shared/types.ts` + OpenSpec; клієнтські обгортки вручну |
| **Медіа-модель** | `Asset` (фото + відео + live photo), UUID | `Photo` (переважно зображення), числовий id |
| **Правки** | Обмежені: crop / rotate / mirror | Ланцюг фільтрів `EditStep[]` + плагіни Sharp |
| **Плагіни** | Workflow/automation methods (тригери, шаблони) | Image filters у процесі сервера (`activate(host)`) |
| **Пам’ять («спогади»)** | CRUD сутностей (`on_this_day`, `birthday`) | Обчислюваний `GET /memories?date=` без збереження |

**Висновок:** Immich — API платформи (upload, sync, users, trash, jobs, share). Paloma — API робочого столу бібліотеки (sidecar, фільтри, обличчя в браузері, гео). Перекривати варто ідеї **пошуку/статистики/таймлайну**, а не копіювати всю поверхню Immich.

---

## 2. Архітектура контракту

| Аспект | Immich | Paloma |
| :--- | :--- | :--- |
| Базовий префікс | `/api` (server у OpenAPI) | `/api` (+ `GET /health` поза префіксом) |
| Спека | OpenAPI 3, генерується з NestJS | Немає; поведінка в OpenSpec + код |
| SDK | Офіційні TS/Dart клієнти | Немає; `client/src/api/*.ts` |
| Тіло запитів | JSON DTO з UUID | JSON; для faces/edits — до 50 MB |
| Помилки | HTTP + Nest/DTO валідація | `{ error, code, params? }` (`ApiErrorCode`) |
| Пагінація | `page`/`size`, cursor у search | `limit`/`offset` на фото (default limit 500) |
| Ідентифікатори | UUID | Числові photo id; album **token**; person contact id (16 hex) |

---

## 3. Авторизація та мультикористувацькість

**Immich**

- Схеми: Bearer, cookie `immich_access_token`, header `x-api-key`.
- Повний контур: login/logout, OAuth, API keys (+ rotate), sessions, users (admin), partners, shared links, cluster groups для спільного розпізнавання людей.
- Детальний опис users / auth / permissions / sharing: [09-immich-users-auth.md](09-immich-users-auth.md).

**Paloma**

- Auth відсутній; CORS відкритий під локальний Vite/Electron-модель.
- Одна бібліотека з `PALOMA_PHOTOS_DIRS`; немаєж користувачів у HTTP немає.

Для Paloma це узгоджено з «приватність на ПК». Якщо колись з’явиться мережевий доступ — модель Immich (API key + scopes) ближча за повний OAuth.

---

## 4. Карта доменів (терміни)

| Домен | Immich | Paloma |
| :--- | :--- | :--- |
| Файл медіа | Asset | Photo |
| Папка на диску | Library (+ `view/folder` за original path) | Folder (індекс скану) |
| Альбом | Album (UUID, shared users) | Album (Picasa-compatible token / sidecar) |
| Обране | `isFavorite` | `isStarred` |
| Прихованість / архів | `visibility`, archive, trash | `isHidden` (без окремого trash API) |
| Теги | Tag CRUD + bulk tag assets | Keywords на фото + `GET /tags` |
| Люди | People + Faces (серверний ML) | People + Faces (детект у браузері, матч на сервері) |
| Карта | `/map/markers`, reverse-geocode | `/geo/points`, `/geo/places`, `/geo/search` |
| Спогади | Memories CRUD | `GET /memories` (computed) |
| Правки | Asset edits (crop/rotate/mirror) | `PUT …/edits` + preview + plugin filters |
| Експорт | Download archive / original | `POST /export`, `POST /creation/movie` |
| Плагіни | Workflow plugins | Image-filter plugins |

---

## 5. Порівняння за доменами

### 5.1 Бібліотека / папки / сканування

| Immich | Paloma |
| :--- | :--- |
| `GET/POST/PUT/DELETE /libraries`, `POST …/scan`, `…/validate`, statistics | `GET /folders` — лише список уже проіндексованих |
| `GET /view/folder`, `…/unique-paths` — навігація за original path | Немає окремого view API; фільтр `folderId` на `GET /photos` |
| Upload: `POST /assets`, bulk-upload-check | Немає upload API — файли з’являються зі сканера ФС |

Paloma навмисно ближча до «слідкуй за папками», Immich — до «завантаж / синхронізуй».

### 5.2 Список і пошук медіа

| Immich | Paloma |
| :--- | :--- |
| `POST /search/metadata` — багатий DTO (альбоми, люди, теги, EXIF, OCR, dates, cursor, `filter` AND/OR) | `GET /photos` — query-параметри (`folderId`, `album`, `tag`, `person`, `starred`, `geotagged`, `query`, дати, `limit`/`offset`) |
| Smart / random / large-assets / suggestions / explore / cities | Немає окремих search-* маршрутів |
| `GET /timeline/buckets`, `…/bucket` | Немає timeline API |
| `GET /assets/statistics`, search statistics | Планується `GET /photos/stats` (change `entry-menu-stats-and-links`) |
| `GET /assets/{id}` + metadata/OCR | `GET /photos/:id/info` (EXIF groups, sidecar source, people, place) |

**Що варто запозичити з Immich (ідеї, не шляхи):** окремий statistics endpoint; cursor для великих бібліотек; структурованіший search body, якщо query-string стане тісним.

### 5.3 Мутації фото / метадані

| Immich | Paloma |
| :--- | :--- |
| `PUT /assets`, `PUT /assets/{id}`, bulk metadata | `PATCH /photos/:id` (`isStarred`, `isHidden`, `caption`, `keywords`, `location`) |
| Favorite / archive / trash / rating / visibility | Star + hide; без rating/trash API |
| `PUT /tags/…`, bulk tag | `POST /photos/keywords` `{ add, remove }` + shortcut `PATCH …/star` |
| `PUT /assets/copy`, delete assets, jobs | Немає delete/copy photo через API (файли на диску) |

Записи Paloma йдуть через **sidecar** (`.paloma.json`), потім індекс у SQLite — інша модель істини, ніж БД Immich.

### 5.4 Зображення (thumbnail / original / preview)

| Immich | Paloma |
| :--- | :--- |
| `GET /assets/{id}/thumbnail?size=&edited=` | `GET /photos/:id/thumbnail\|preview` (+ `?r=` render key) |
| `GET /assets/{id}/original?edited=` | `GET /raw/:photoId` (оригінал з диска) |
| Відео playback / HLS stream | Немає |
| — | Content-addressed `GET /cache/thumbnail\|preview/:fileHash` для невідредагованих |
| — | `POST /photos/:id/preview` — незбережений прев’ю ланцюга правок |

Paloma сильніша в **preview незастосованих правок** і розділенні cache-by-hash vs edited-by-id. Immich сильніший у відео та `edited` flag на тих самих URL.

### 5.5 Неруйнівні правки

| Immich | Paloma |
| :--- | :--- |
| `GET/PUT/DELETE /assets/{id}/edits` | `PUT /photos/:id/edits` |
| Дії: **crop, rotate, mirror** лише | `EditStep[]`: `{ filter, …params }` — будь-які плагінні фільтри |
| — | Live preview без збереження (`POST …/preview`) |

Тут Paloma ближча до Picasa/редактора; Immich — мінімальний non-destructive geometry.

### 5.6 Альбоми

| Immich | Paloma |
| :--- | :--- |
| CRUD за UUID; statistics; map-markers альбому | CRUD за **token**; без окремого get-by-id (список + клієнт) |
| Shared album users, activity feed | Немає шерингу |
| `PUT …/assets`, bulk add to many albums | `POST/DELETE /albums/:token/photos` |

### 5.7 Теги

| Immich | Paloma |
| :--- | :--- |
| Повноцінні Tag сутності (create/update/delete/upsert) | Теги = keywords рядки на фото |
| Bulk tag/untag за tag id | Bulk add/remove keywords на `photoIds` |
| `GET /tags` | `GET /tags` → `{ name, photoCount }` |

### 5.8 Люди та обличчя

| Immich | Paloma |
| :--- | :--- |
| Серверний face pipeline + jobs/queues | Детекція в браузері (`@vladmandic/face-api`); сервер зберігає дескриптори |
| Merge people, reassign faces, share people across users/cluster groups | Assign / dismiss / similar; без merge/share API |
| `GET /people/{id}/thumbnail` | `GET /people/:id/avatar` + face crops |
| `GET/POST/PUT/DELETE /faces` | `PUT /photos/:id/detected-faces`, `GET /faces/unassigned`, `POST /faces/pending` |

Спільна ідея CRUD people + прив’язка до фото; **місце ML** різне (сервер vs клієнт).

### 5.9 Гео / карта

| Immich | Paloma |
| :--- | :--- |
| `GET /map/markers` (фільтри favorite/archived/partners) | `GET /geo/points` (ті самі photo-filters, **без** пагінації) |
| `GET /map/reverse-geocode?lat&lon` | `GET /geo/places`, `GET /geo/search` (+ settings з `.env`) |
| Геокодинг також у search (city/country/state) | Place names у `lang` на photos/places |

### 5.10 Memories

| Immich | Paloma |
| :--- | :--- |
| Збережені memories: create/update/delete, assets, statistics, `on_this_day` / `birthday` | `GET /memories?date=` — обчислення «в цей день» на льоту, без persistence |

Імена збігаються, семантика — ні.

### 5.11 Плагіни

| Immich | Paloma |
| :--- | :--- |
| HTTP: list plugins / methods / templates — для **workflows** (automation) | HTTP: list/enable + SVG icons фільтрів |
| Плагін = методи тригерів/дій у workflow engine | Плагін = in-process `FilterDefinition.render` через Sharp host API |

Однойменні «plugins», різні продукти: автоматизація vs графічні фільтри.

### 5.12 Експорт / створення / завантаження

| Immich | Paloma |
| :--- | :--- |
| `POST /download/info`, `POST /download/archive` | `POST /export` (JPEG у `exportDir`) |
| Оригінал asset endpoint | `POST /creation/movie` (ffmpeg slideshow; правки поки не застосовуються) |

### 5.13 Те, чого в Paloma немає (Immich-only, скорочено)

Мультикористувачі, OAuth, API keys, partners, shared links, activities, trash/restore, stacks, duplicates, sync stream, jobs/queues, workflows, notifications, server/admin config, database backups, integrity reports, video streaming, OCR search, smart search, timeline buckets, cluster groups.

### 5.14 Те, чого в Immich немає (або слабше) у стилі Paloma

- Ланцюг image-filter правок + live unsaved preview.
- Content-addressed thumbnail cache окремо від asset id.
- Picasa-сумісні album tokens / sidecar як джерело істини.
- Клієнтський face-detect з явним `pending` / `unassigned` API.
- Локальний movie maker і «export у папку на диску» як desktop-операції.
- Complexity levels / senior UI у контракті плагінів (`level` на фільтрах).

---

## 6. Таблиця «близьких» маршрутів

| Здатність | Immich | Paloma |
| :--- | :--- | :--- |
| Список медіа | `POST /search/metadata` (і timeline) | `GET /photos` |
| Одне медіа / інфо | `GET /assets/{id}`, metadata | `GET /photos/:id/info` |
| Оновити поля | `PUT /assets/{id}` | `PATCH /photos/:id` |
| Favorite/star | поля asset / bulk update | `PATCH /photos/:id/star` |
| Thumbnail | `GET /assets/{id}/thumbnail` | `GET /photos/:id/thumbnail` або `/cache/…` |
| Original | `GET /assets/{id}/original` | `GET /raw/:photoId` |
| Edits | `PUT /assets/{id}/edits` | `PUT /photos/:id/edits` |
| Альбоми list/create | `GET/POST /albums` | `GET/POST /albums` |
| Альбом + фото | `PUT/DELETE /albums/{id}/assets` | `POST/DELETE /albums/:token/photos` |
| Теги list | `GET /tags` | `GET /tags` |
| People CRUD | `/people` | `/people` |
| Map points | `GET /map/markers` | `GET /geo/points` |
| Place search | `GET /search/places` | `GET /geo/search` |
| Memories | `GET/POST /memories` … | `GET /memories` |
| Plugins list | `GET /plugins` | `GET /plugins` |
| Libraries/folders | `/libraries`, `/view/folder` | `GET /folders` |
| Health/ping | `GET /server/ping` | `GET /health` |

---

## 7. Рекомендації для Paloma (якщо дивитись на Immich як на референс)

1. **Не цілитись у паритет поверхні** — більшість Immich API (users, sync, trash, jobs) поза філософією desktop/Picasa.
2. **Корисні ідеї для майбутніх OpenSpec changes:**  
   - `GET …/statistics` (вже в черзі як photos stats);  
   - багатший search (OCR/camera facets — опційно);  
   - cursor pagination для дуже великих бібліотек;  
   - явний `GET /photos/:id` поруч із `/info`, якщо клієнтам знадобиться легкий DTO.
3. **Зберегти відмінності:** sidecar-first, filter-edit chain, browser-side faces, відсутність auth для local-trusted моделі.
4. **Узгодити словник обережно:** «asset» Immich ≠ «photo» Paloma; «plugin» означає різне — у документації й кода не змішувати.
5. **OpenAPI для Paloma** — опційна інвестиція, якщо з’являться зовнішні клієнти; зараз shared types + OpenSpec достатні для одного UI.

---

## 8. Посилання

- Immich API overview: https://docs.immich.app/api  
- Immich endpoint browser: https://api.immich.app/endpoints  
- Immich OpenAPI JSON: https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json  
- Paloma routes: `server/src/routes/index.ts`  
- Shared types: `shared/types.ts`  
- Підтверджена поведінка Paloma: `openspec/specs/`
