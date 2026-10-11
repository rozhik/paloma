# Immich — файли, папки та дублікати

> Знімок на **2026-10-10**. Референс для Paloma (невизначена пропозиція, не контракт).  
> Джерела: [External Libraries](https://docs.immich.app/features/libraries), [Folder View](https://docs.immich.app/features/folder-view), [Storage Template](https://docs.immich.app/administration/storage-template), [Duplicates Utility](https://docs.immich.app/features/duplicates-utility), [FAQ](https://docs.immich.app/FAQ), [API duplicates](https://api.immich.app/endpoints/duplicates).  
> Порівняння HTTP-поверхні: [07-immich-api-comparison.md](07-immich-api-comparison.md).  
> Users / auth / rights: [09-immich-users-auth.md](09-immich-users-auth.md).

---

## 1. Короткий вердикт

| | **Immich** | **Paloma (орієнтир)** |
| :--- | :--- | :--- |
| **Модель файлу** | `Asset` у Postgres; оригінал на диску за `originalPath` | `Photo` у SQLite; файл у папці користувача + `.paloma.json` |
| **Звідки з’являються файли** | Upload (мобільний/CLI/web) **або** External Library (скан існуючих дерев) | Лише скан коренів з `PALOMA_PHOTOS_DIRS` |
| **Папки на диску** | Не первинна оргструктура таймлайну; опційний Folder View + Storage Template | Дерево папок — основна навігація бібліотеки |
| **Байт-ідентичні дублікати** | SHA-1 checksum при upload (per-user / per-library) | `file_hash` при індексі (див. scanner) |
| **«Схожі» дублікати** | ML (CLIP embeddings) + Review duplicates UI | Немає окремого duplicates-flow |
| **Видалення** | Trash → purge (~30 днів); для external — trash після rescan, якщо файл зник з диска | Без trash API; файли лишаються на диску |

**Висновок для Paloma:** з Immich варто дивитись на **два шари дедуплікації** (хеш при імпорті vs візуальна схожість), **Folder View як explorer поверх індексу**, і чітке розділення «файли Immich керує» vs «файли лише читає» — ближче до External Library, ніж до Upload Library.

---

## 2. Файли (Asset storage)

### 2.1 Два джерела оригіналів

Immich розрізняє:

1. **Upload library (внутрішня)** — користувач / мобільний клієнт / CLI завантажує файли. Immich **володіє** копією в `UPLOAD_LOCATION` (типово `/data` у контейнері). Адмін може вмикати **Storage Template**, щоб розкладати оригінали за шаблоном шляху (`{{y}}/{{MM}}/{{filename}}` тощо) замість UUID-імен.
2. **External library** — Immich **індексує** вже існуючі дерева на диску (NAS, архів). Оригінали лишаються там, де їх поклав користувач; Immich створює `Asset` і похідні (thumbnails, encoded video, ML) у своєму сховищі.

У БД для кожного asset зберігаються зокрема `originalPath`, `originalFileName`, `checksum` (SHA-1 вмісту). Метадані UI (альбоми, опис, favorite) для external assets **часто лише в БД Immich**, не в самому файлі — особливо якщо volume змонтовано `:ro`.

### 2.2 Похідні файли

Окрім оригіналу Immich тримає окремі шляхи для:

- thumbnail / preview / full-size (залежно від конвеєра jobs);
- encoded video (для playback);
- sidecar XMP (якщо дозволено запис і користувач пише метадані на диск);
- face crops / profile media.

Це **не sidecar-first** модель Paloma: джерело істини для каталогу — Postgres + jobs, а не JSON поруч із фото.

### 2.3 Trash і видалення

- Soft-delete: asset потрапляє в trash (`deletedAt`), файл оригіналу **зазвичай не переїжджає** в окрему `.trash`-папку — лишається на поточному `originalPath` до остаточного purge.
- Для **external**: якщо файл зник з диска, після rescan Immich переводить asset у trash; відновлення = повернути файл на місце. Через ~30 днів trash очищається, і зміни метаданих у Immich губляться.
- Read-only mount (`:ro`) блокує delete з UI та запис XMP у external шляхи.

### 2.4 Storage Template (лише upload)

| Аспект | Поведінка |
| :--- | :--- |
| Хто налаштовує | Admin → Settings → Storage Template |
| За замовчуванням (template off) | Імена на кшталт UUID, щоб уникнути колізій імен |
| Template on | Шлях/ім’я з змінних дати, album, camera тощо |
| Колізія імен | Суфікс `+1`, `+2`, … — файл **не перезаписується** |
| Міграція | Job «Storage Template Migration» перекладає вже завантажені оригінали |

External library **не перекладається** Storage Template — папки лишаються «як на диску».

---

## 3. Управління папками

### 3.1 External Library = керування деревами імпорту

Адмін створює бібліотеку, прив’язує її до **одного користувача** (назавжди), додає один або кілька **import paths**.

| Правило | Деталі |
| :--- | :--- |
| Рекурсія | Кожен import path сканується рекурсивно |
| Перетин шляхів | Той самий файл у двох import paths додається **один раз** |
| Exclusion patterns | Glob (Picomatch) по **повному** шляху: `**/Raw/**`, `**/*.{arw,dng}`, `**/@eaDir/**` |
| Зміна import paths | Файл поза всіма шляхами знімається з бібліотеки як «видалений»; повернення = новий asset |
| Переміщення файлу всередині library | Відомий біль: метадані Immich можуть втратитись — asset вважається новим після rescan |
| Розклад скану | Nightly job + налаштовуваний cron; experimental filesystem watcher (`chokidar`-подібний; на NFS часто не працює) |
| Видалення library | Усі assets бібліотеки видаляються одразу (фоновий cleanup) |

Docker: шляхи в UI мають збігатись із тим, що бачить контейнер (`/mnt/media/...`), не з host-шляхом NAS.

### 3.2 Folder View (навігація, не модель даних)

Опція акаунта: **Account Settings → Features → Folders**.

- Додатковий режим поруч із timeline — як file explorer за `originalPath`.
- Корисний для курованих external дерев або коли Storage Template зібрав upload у зрозумілі папки.
- **Не замінює** альбоми й timeline; це view поверх уже проіндексованих шляхів.

API-аналог: `GET /view/folder`, `…/unique-paths` (див. порівняння в 07).

### 3.3 Що Immich *не* робить з папками

- Немає desktop-моделі «бічне дерево = істина архіву» як у Picasa/Paloma.
- Немає sidecar `.immich.json` у кожній папці користувача.
- CRUD «папок» у сенсі ФС для upload — це наслідок Storage Template / переміщень jobs, а не ручного дерева в UI.
- Альбоми Immich — логічні колекції (з шерингом), не обов’язково папки на диску (хоча template може класти файли в `{{album}}/...`).

---

## 4. Дублікати

Immich розділяє **байт-ідентичність** і **візуальну схожість**.

### 4.1 Checksum / upload dedup (байт у байт)

| Механізм | Поведінка |
| :--- | :--- |
| Хеш | SHA-1 вмісту файлу при upload |
| Обмеження | Унікальність checksum **per user / per library**, не глобально на весь сервер |
| Bulk check | `POST` bulk-upload-check — клієнт (мобільний, CLI) питає ACCEPT/REJECT перед завантаженням |
| Відповідь | `DUPLICATE` → існуючий `assetId` (і прапорець trash, якщо вже в кошику) |
| CLI | `--delete-duplicates` — видалити локальні файли, що вже є на сервері; `--skip-hash` вимикає перевірку |

**External libraries:** офіційний FAQ — *duplicate checking by file hash існує для upload libraries*; у external той самий байтовий файл у різних місцях (або двох libraries) **може з’явитись двічі** в timeline. Це принципова відмінність від «жорсткої» дедуплікації upload.

### 4.2 Duplicates Utility (візуально схожі)

| Аспект | Поведінка |
| :--- | :--- |
| Детекція | ML на CLIP embeddings (увімкнено за замовчуванням; job у черзі workers) |
| Поріг | Admin → System Settings → Duplicate Detection: *maximum detection distance* `0.001`–`0.1` (вище = більше груп і false positives) |
| UI | «Review duplicates» — групи схожих assets |
| Keep suggestion | Більший файл (байти) → більше EXIF-полів |
| Resolve | Залишити / trash; при **одному** keep + trash інших — merge метаданих у keep |
| Merge полів | albums, favorite, max rating, зліплені descriptions, найжорсткіша visibility, location (лише якщо координати збігаються), tags |
| Кілька keep | Метадані **не** зливаються; опція скласти keep у **stack** |
| Bulk | «Deduplicate All» / API `POST /duplicates/resolve` (+ bulk resolve усіх груп за suggestions) |
| Dismiss | Зняти групу без видалення файлів (`DELETE /duplicates/{id}`) |
| Stack | `POST /duplicates/stack` або опція в UI — RAW+JPEG / burst як одна «стопка» в timeline |

API-поверхня (орієнтир): `GET /duplicates`, `POST /duplicates/resolve`, `POST /duplicates/resolve/bulk`, `POST /duplicates/stack`, dismiss/delete variants.

### 4.3 Stacks vs trash

- **Stack** — кілька assets лишаються на диску; у timeline показується primary, решта згорнуті.
- **Trash duplicate** — зайві копії йдуть у кошик; для upload це може означати подальше фізичне видалення з `UPLOAD_LOCATION`; для external залежить від прав на volume.

---

## 5. Карта потоків (схема)

```
Upload path                         External path
────────────                        ─────────────
Mobile/CLI/Web                      Import paths (+ exclusions)
      │                                   │
      ▼                                   ▼
 SHA-1 bulk check                    Recursive crawl / watcher
 ACCEPT / DUPLICATE                       │
      │                                   ▼
      ▼                             Asset rows (no hash-uniq guarantee)
 Store under UPLOAD_LOCATION              │
 (+ optional Storage Template)            │
      │                                   │
      └──────────────┬────────────────────┘
                     ▼
              Asset in Postgres
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    Thumbnails    CLIP emb.   Folder View
         │           │        (by originalPath)
         │           ▼
         │    Duplicate groups (visual)
         │           │
         │    Review → keep / trash / stack
         ▼
    Timeline / Albums / Map
```

---

## 6. Що з цього релевантно для Paloma

1. **Ближче до External Library:** Paloma вже «слідкує за папками», не за upload API. Варто явно документувати поведінку при переміщенні/видаленні файлу на диску (Immich тут слабший і це задокументовано як known issue).
2. **Два типи дублікатів:** хеш при імпорті/скані (у Paloma вже є `file_hash`) ≠ «схожі фото» (Immich ML). Якщо додавати duplicates UI — не змішувати ці поняття.
3. **Folder View як опція:** для senior/Picasa UX дерево папок важливіше, ніж у Immich; у Immich воно вторинне до timeline.
4. **Не копіювати Storage Template** як обов’язок — це модель «сервер розкладає upload». У Paloma користувач сам тримає дерево; sidecar лишається джерелом правок.
5. **Trash + metadata merge при resolve** — корисна продуктова ідея, якщо з’явиться дедуп схожих; для desktop важливіше не губити captions/keywords/альбоми з sidecar.

---

## 7. Посилання

- External Libraries: https://docs.immich.app/features/libraries  
- External Library guide: https://docs.immich.app/guides/external-library  
- Folder View: https://docs.immich.app/features/folder-view  
- Storage Template: https://docs.immich.app/administration/storage-template  
- Duplicates Utility: https://docs.immich.app/features/duplicates-utility  
- FAQ (duplicates in external, storage names): https://docs.immich.app/FAQ  
- API duplicates: https://api.immich.app/endpoints/duplicates  
- Paloma storage: [06-storage-and-metadata.md](06-storage-and-metadata.md)  
- API comparison: [07-immich-api-comparison.md](07-immich-api-comparison.md)
