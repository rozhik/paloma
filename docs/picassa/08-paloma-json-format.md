# 08. Формат `.paloma.json` — власний sidecar Paloma

Paloma зберігає всі свої дані про папку у файлі `.paloma.json`. Модель запозичено з Picasa: прихований файл у кожній папці, центральний індекс (SQLite), який можна відновити з цих файлів, оригінали в `.picasaoriginals/`. Відрізняється лише формат: замість INI — JSON, який зручно читати людині.

**Головне правило:** Paloma **ніколи не пише** `.picasa.ini`, `Picasa.ini` і `.picasaoriginals/.picasa.ini`. Ці файли лише імпортуються (специфікація — [07-picasa-ini-format.md](07-picasa-ini-format.md)). Усе, що змінює Paloma, потрапляє лише в `.paloma.json`.

Вимоги до формату:

* **Не менше можливостей, ніж у `.picasa.ini`.** Кожен ключ, секція і фільтр з 07 мають місце в JSON. Те, що Paloma не розуміє, зберігається сирим (§7), тому імпорт нічого не втрачає.
* **Читабельність.** Значення розібрано: прямокутники — об'єкти `left/top/right/bottom` у частках 0…1, кути — у градусах, кольори — `#rrggbb`, дати — ISO 8601, параметри фільтрів — іменовані поля.
* **Стиль Picasa.** Імена фільтрів (`crop64`, `finetune2`, `Vignette`) і ключів (`star`, `rotate`, `albums`) збігаються з Picasa. Тому таблиці з 07 водночас документують і JSON.

---

## 1. Де лежать файли

```
📁 /Pictures/Vacation/
├── 🖼️ IMG_0042.jpg
├── 📖 .picasa.ini              <-- лише читання (імпорт)
├── 📝 .paloma.json             <-- стан папки (§2)
└── 📁 .picasaoriginals/
    ├── 🖼️ IMG_0042.jpg         <-- незмінений оригінал (після Save)
    ├── 📖 .picasa.ini          <-- лише читання, якщо Save робила Picasa
    └── 📝 .paloma.json         <-- стан оригіналів (§6)
```

## 2. Загальна структура

```json
{
  "format": "paloma-folder",
  "version": 2,
  "folder": { … },
  "albums": { … },
  "people": { … },
  "photos": { … },
  "import": { … },
  "extra": { … }
}
```

| Поле | Аналог у `.picasa.ini` | Опис |
| :--- | :--- | :--- |
| `format` | — | Завжди `"paloma-folder"` (у `.picasaoriginals/` — `"paloma-originals"`, §6) |
| `version` | — | Версія схеми. `1` — поточний формат `SidecarService` (до цієї специфікації) |
| `folder` | `[Picasa]` | Метадані папки (§3.1) |
| `albums` | `[.album:<token>]` | Визначення альбомів, ключ — `token` (§3.2) |
| `people` | `[Contacts2]` | Локальні контакти, ключ — `contactId` (§3.3) |
| `photos` | `[<ім'я файлу>]` | Стан файлів, ключ — ім'я файлу (§4) |
| `import` | — | Звідки й коли імпортовано дані з `.picasa.ini` (§5) |
| `extra` | невідомі секції, `[Contacts]`, `[photoid]`, `[encoding]`, `[(null)]` | Сирі дані, які Paloma не інтерпретує (§7) |

Порожні та дефолтні значення не пишуться: немає `star` — фото не позначене, немає `edits` — правок немає.

---

## 3. Секції рівня папки

### 3.1. `folder`

```json
"folder": {
  "name": "Карпати 2024",
  "category": "Folders on Disk",
  "date": "2024-05-09T12:00:00",
  "description": "…",
  "location": "…"
}
```

| Поле | З `.picasa.ini` | Конвертація |
| :--- | :--- | :--- |
| `name` | `[Picasa] name` | Без змін. Пробіли зберігаються |
| `category` | `P2category`, інакше `category` | Без змін. Якщо обидва ключі є і відрізняються, `category` йде в `extra` |
| `date` | `date` (OLE DATE, `%f`) | ISO 8601 **без зони**: це локальний час машини, де писали файл (07 §5.3) |
| `description`, `location` | ті самі ключі | Без змін |

### 3.2. `albums`

```json
"albums": {
  "c9ea9fa67022f38a3c771894d2a8a468": {
    "name": " Птахи",
    "date": "2018-10-23T15:33:29+03:00",
    "location": " ",
    "description": "…"
  }
}
```

* Ключ — `token` (32 hex). Дублювати `token` усередині не треба.
* `date` — ISO 8601 зі зміщенням, як у Picasa.
* Як і в Picasa, альбом глобальний: його визначення копіюється в кожну папку, де є фото з цього альбому. Неповне визначення (лише `token`) записується як `{}`. Назву тоді беруть з іншої папки (07 §2.2).

### 3.3. `people`

```json
"people": {
  "b8e4117cf1d6615b": { "name": "Roy Avery", "email": "roy@example.com", "googleId": null }
}
```

* Ключ — `contactId`: 16 hex, нижній регістр, **з провідними нулями** (у Picasa їх немає, 07 §7).
* `name`, `email`, `googleId` ← три поля `[Contacts2]` (`Ім'я;email;gaia`). Порожні значення — `null`.
* `[Contacts]` (контакти облікового запису Google) семантично не розібрано, тому секція йде в `extra`.

---

## 4. `photos` — стан окремого файлу

Повний приклад:

```json
"IMG_0042.jpg": {
  "star": true,
  "rotate": 90,
  "albums": ["c9ea9fa67022f38a3c771894d2a8a468"],
  "caption": "Схід сонця на вершині",
  "keywords": ["гори", "схід сонця"],
  "geotag": { "lat": 48.160833, "lon": 24.500278 },
  "edits": [
    { "filter": "crop64", "rect": { "left": 0.205325, "top": 0.122103, "right": 0.822827, "bottom": 0.90956 } },
    { "filter": "autolight" },
    { "filter": "finetune2", "fillLight": 0, "highlights": 0, "shadows": 0.140351, "neutral": null, "temperature": 0 },
    { "filter": "unsharp2", "amount": 3 },
    { "filter": "Border", "params": ["0.100000", "0.020000", "0.000000", "00ffffff", "00000000", "0.000000"] }
  ],
  "redo": [
    { "filter": "warm" }
  ],
  "text": {
    "active": true,
    "layers": [ { … } ]
  },
  "faces": [
    { "rect": { "left": 0.342184, "top": 0.136461, "right": 0.632029, "bottom": 0.88542 }, "person": "b8e4117cf1d6615b" },
    { "rect": { "left": 0.313222, "top": 0.009354, "right": 0.367575, "bottom": 0.071534 }, "ignored": true }
  ],
  "modified": "2026-10-04T14:20:00Z",
  "extra": { "backuphash": "52410" }
}
```

### 4.1. Прості поля

| Поле JSON | Ключ `.picasa.ini` | Конвертація |
| :--- | :--- | :--- |
| `star` | `star=yes` | `true` |
| `hidden` | `hidden=yes` | `true` |
| `screensaver` | `screensaver=yes` | `true` |
| `rotate` | `rotate(N)` | Градуси за годинниковою стрілкою: `N × 90` ∈ {0, 90, 180, 270}. `0` не пишеться |
| `flip` | `flipped(N)` | `N` без змін (семантика ❔). `0` не пишеться |
| `albums` | `albums=t1,t2` | Масив токенів |
| `caption` | `caption` | Рядок (§4.6) |
| `keywords` | `keywords=a,b` | Масив рядків (§4.6) |
| `geotag` | `geotag=lat,lon` | `{ "lat": …, "lon": … }`, десяткові градуси (§4.6) |
| `edits` | `filters` | Впорядкований масив фільтрів (§4.2) |
| `redo` | `redo` | Те саме, що `edits`. На рендер не впливає |
| `text` | `text` + `textactive` | §4.4 |
| `faces` | `faces` | §4.5 |
| `modified` | — | Час останньої зміни **в Paloma** (UTC). Немає поля — запис лише імпортовано |
| `extra` | невідомі ключі, `backuphash`, `originhash`, `IIDLIST_*` | Сирі рядки (§7) |

Ключ `crop=` **не** переноситься: він лише дублює останній `crop64` з `filters` (07 §3).

### 4.2. `edits` — ланцюжок фільтрів

`edits` повторює `filters=` з Picasa: впорядкований масив, фільтри застосовуються від першого до останнього, повтори дозволені. Повторне кадрування **додає** новий `crop64`, а не замінює попередній. Поточний кадр — останній `crop64`.

Кожен елемент:

```json
{ "filter": "<ім'я як у Picasa>", "enabled": false, …іменовані параметри… }
```

* `filter` — ім'я з Picasa, з урахуванням регістру (`Vignette`, а не `vignette`).
* `enabled` пишеться лише як `false`, тобто коли перший параметр Picasa — `0`. У корпусі такого не траплялося.
* Числа — звичайні JSON-числа: `0.140351`, а не `"0.140351"`.
* Кольори — `"#rrggbb"`, нижній регістр. Альфа-байт фільтрів Picasa ігнорує (07 §5.2). `00000000` у полі `neutral` означає «не вибрано» і пишеться як `null`.

**Фільтри з відомою семантикою** (📚/✅ у 07 §4.2) мають іменовані поля:

| `filter` | Поля | З параметрів Picasa |
| :--- | :--- | :--- |
| `crop64` | `rect` | `rect64` → об'єкт (§4.3) |
| `tilt` | `angle`, `scale` | `1, angle, scale` (одиниці `angle` не з'ясовано: зберігати як є) |
| `fill` | `amount` | `1, amount` |
| `finetune2` | `fillLight`, `highlights`, `shadows`, `neutral`, `temperature` | `1, fill, highlights, shadows, neutral, temperature` |
| `unsharp2`, `sat`, `Boost` | `amount` | `1, amount` |
| `Vignette` | `radius`, `strength`, `fade`, `color` | `1, radius, strength, fade, color` |
| `autolight`, `autocolor`, `enhance`, `warm`, `bw`, `sepia`, `Invert` | — | `1` |

**Фільтри з невідомою або неперевіреною семантикою** (🔶/❔: `Border`, `MuseumMatte`, `Neon`, `PencilSketch`, `PicnikGrain`, `Soften`, `redeye`, `retouch`, `tint`, `glow2` тощо) зберігаються як `params`: масив **сирих рядків** після прапорця `1`, рівно як у файлі. Тип параметра тут невідомий (`00000000` може бути і кольором, і числом), тому вгадувати не можна. Коли семантику фільтра підтвердять, його переводять в іменовані поля зі збільшенням `version`.

```json
{ "filter": "redeye" }
{ "filter": "PicnikGrain", "params": ["0.350000", "0"] }
```

### 4.3. Прямокутники

```json
{ "left": 0.199466, "top": 0.11487, "right": 1, "bottom": 1 }
```

* Частки 0…1 від лівого верхнього кута, як у `rect64`. Формат `[x, y, width, height]` **не** використовується, щоб імпорт `rect64` і зворотне перетворення були тривіальними.
* Конвертація з `rect64`: `padStart(16, '0')` → чотири 16-бітні слова → `/ 65535` → округлення до 6 знаків. Крок `1/65535 ≈ 0.0000153`, тож 6 знаків відтворюють вихідне 16-бітне значення без втрат.

### 4.4. `text` — текстові шари

```json
"text": {
  "active": true,
  "layers": [
    {
      "text": "пяденица  пятнистая\nдругий рядок",
      "font": "Arial",
      "x": 0.436478,
      "y": 0.682873,
      "size": 0.019354,
      "angle": -90,
      "color": "#ffffff",
      "outline": null,
      "outlineWidth": 0,
      "weight": 700,
      "style": { "version": "v1", "p3": "128.000000", "p4": "1.000000", "p6": "1.000000", "p8": "0", "flags": "49152" }
    }
  ]
}
```

| Поле | З `text=` (07 §6) | Конвертація |
| :--- | :--- | :--- |
| `active` | `textactive` | `1` → `true`. Якщо `textactive=0` і шарів немає — `{ "active": false, "layers": [] }` |
| `text` | `txt` | Розекранований: `&#010;` → `\n`. Довжини `recLen`/`txtLen` не зберігаються, їх легко обчислити |
| `font`, `x`, `y`, `size` | `font`, `geom` | Без змін |
| `angle` | `geom.angle` (радіани) | **Градуси**, округлення до 4 знаків |
| `color` | `style[1]` (ARGB десятково) | `"#rrggbb"`, або `"#rrggbbaa"` (порядок CSS), якщо альфа ≠ `ff`. `0` → `null` |
| `outline` | `style[2]` | Так само; `0` → `null` |
| `outlineWidth` | `style[5]` | Число |
| `weight` | `style[7]` | `LOGFONT.lfWeight`, 1:1 з CSS `font-weight` |
| `style` | `style[0,3,4,6,8,9]` | Сирі рядки: семантика 🔶. Після розшифровки (напр. біт курсиву в `flags`) поля переходять в іменовані |

> ⚠️ Порядок `#rrggbbaa` — як у CSS, а не ARGB Picasa: `0xFF000000` (чорний непрозорий) → `"#000000"`, `0x80FF0000` → `"#ff000080"`.

### 4.5. `faces` — обличчя

| Поле | З `faces=rect64(…),<id>` |
| :--- | :--- |
| `rect` | `rect64` → §4.3 |
| `person` | `contactId`, нормалізований до 16 hex. Посилання на `people` або на контакт з `extra` |
| `ignored: true` | `contactId = ffffffffffffffff` («ігнорувати»). Поле `person` тоді не пишеться |

### 4.6. Підпис, теги, геотег і вбудовані метадані

Paloma **не змінює метадані в самих фото** (EXIF/IPTC/XMP). `caption`, `keywords` і `geotag` живуть лише в `.paloma.json`.

* **Початкове значення.** Для не-JPEG — з `.picasa.ini`. Для JPEG Picasa пише підпис і теги в IPTC/XMP файлу (06 §4), тож Paloma читає їх звідти, лише для читання.
* **Зміна в Paloma** записується тільки в JSON і перекриває значення з файлу.
* **Save** (§6) перезаписує пікселі, але вбудовані метадані оригіналу переносить без змін.
* **Запис у EXIF/IPTC/XMP** — лише при експорті (06 §5). Експорт зараз поза рамками цієї специфікації.

---

## 5. `import` — зв'язок з `.picasa.ini`

```json
"import": {
  "source": ".picasa.ini",
  "importedAt": "2026-10-04T14:20:00Z",
  "mtime": "2024-05-09T09:00:00Z",
  "sha256": "9f2c…",
  "sections": {
    "IMG_0042.jpg": "a41b…",
    ".album:c9ea9fa67022f38a3c771894d2a8a468": "07de…",
    "Picasa": "1c3e…"
  }
}
```

* `source` — фактичне ім'я файлу (`.picasa.ini` або `Picasa.ini`).
* `sha256` — хеш усього файлу, `sections` — хеш сирих байтів кожної секції. Так видно, які саме секції змінилися.

**Правила злиття:**

1. Поки `.paloma.json` у папці немає, Paloma показує стан, прочитаний з `.picasa.ini` наживо, і нічого не пише.
2. Перша зміна в папці створює `.paloma.json`. У нього імпортується **вся** `.picasa.ini` (знімок) і заповнюється `import`. Далі для цієї папки джерело істини — JSON.
3. Якщо `.picasa.ini` потім змінилася (користувач і далі працює в Picasa; `sha256` не збігається), Paloma порівнює хеші секцій:
   * секцію змінено в `.ini`, а відповідний запис у JSON не має `modified` (Paloma його не чіпала) → імпортувати повторно автоматично;
   * секцію змінено в `.ini`, і запис має `modified` → **конфлікт**: показати користувачу, нічого не перезаписувати мовчки;
   * нова секція в `.ini` → імпортувати.
4. Секції `.ini` для відсутніх файлів (сирітські, 07 §2.3) імпортуються як є й не видаляються.

---

## 6. `.picasaoriginals/.paloma.json` — стан оригіналів

Paloma, як і Picasa, робить **Save** через приховану папку `.picasaoriginals/`. Але свої дані про оригінали пише у власний JSON:

```json
{
  "format": "paloma-originals",
  "version": 2,
  "photos": {
    "DSC05378.JPG": {
      "savedAt": "2026-10-04T14:25:00Z",
      "savedBy": "paloma",
      "original": { "modified": "2009-08-14T19:37:14Z", "width": 3888, "height": 2592, "sha256": "…" },
      "baked": [ { "filter": "enhance" }, { "filter": "redeye" } ],
      "bakedText": { "active": false, "layers": [] },
      "bakedRotate": 0
    }
  },
  "import": { "source": ".picasa.ini", "…": "…" }
}
```

| Поле | Аналог у `.picasaoriginals/.picasa.ini` (07 §9.2) |
| :--- | :--- |
| `original.modified` | `moddate` (`FILETIME` → ISO 8601 UTC) |
| `original.width`, `original.height` | `width`, `height` |
| `original.sha256` | — (Paloma: щоб перевірити, що оригінал не підмінили) |
| `baked` | `filters` — правки, запечені у файл у батьківській папці, відносно оригіналу |
| `bakedText`, `bakedRotate` | `text`/`textactive`, `rotate` |
| `savedBy` | `"paloma"` або `"picasa"` (запис імпортовано з `.picasaoriginals/.picasa.ini`) |

**Save у Paloma:**

1. Якщо `.picasaoriginals/<ім'я>` ще немає — перемістити туди оригінал. Якщо є (Save уже робили раніше, у Picasa чи в Paloma), **не чіпати**: там справжній оригінал.
2. Відрендерити поточний стан і записати файл на місце оригіналу в батьківській папці.
3. У `.picasaoriginals/.paloma.json` записати `baked` = попередні `baked` + поточні `edits`, тобто весь ланцюжок відносно оригіналу.
4. У батьківському `.paloma.json` очистити `edits`, `text` і `rotate` цього фото: вони вже запечені.

**Revert to Original:**

1. Повернути `.picasaoriginals/<ім'я>` на місце файлу в батьківській папці.
2. Перенести `baked` назад у `edits` батьківського `.paloma.json`. Правки знову стають неруйнівними, і їх можна редагувати.
3. Видалити запис із `.picasaoriginals/.paloma.json`.

Якщо Save робила Picasa, її `.picasaoriginals/.picasa.ini` не змінюється. Запис з нього спершу імпортується в `.picasaoriginals/.paloma.json` (`savedBy: "picasa"`). Секції `.ini`, для яких файлу в `.picasaoriginals/` вже немає, при читанні ігноруються.

---

## 7. `extra` — сирі дані

Щоб імпорт нічого не губив, усе, що Paloma не інтерпретує, зберігається сирими рядками, як у файлі (пробіли не обрізаються):

* `photos.<ім'я>.extra` — невідомі ключі секції файлу, а також `backuphash`, `originhash`, `IIDLIST_<user>_lh` тощо: `{ "backuphash": "52410" }`.
* `albums.<token>.extra` — `name_lh` та інші невідомі ключі альбому.
* `folder.extra` — невідомі ключі `[Picasa]`.
* Кореневий `extra` — цілі секції: `{ "Contacts": { "<id>": "<raw>" }, "photoid": { … }, "encoding": { "utf8": "1" } }`.

`extra` Paloma не редагує й не показує в UI, хіба що в режимі діагностики.

---

## 8. Прийняті рішення

1. **`.ini` лише для імпорту.** Paloma ніколи не пише `.picasa.ini`, `Picasa.ini` і `.picasaoriginals/.picasa.ini`.
2. **Метадані у файлах фото не змінюються.** `caption`/`keywords`/`geotag` живуть лише в JSON; запис у EXIF/IPTC/XMP — тільки при експорті (§4.6).
3. **Повний знімок.** При першій зміні вся `.picasa.ini` імпортується в JSON (§5), а не лише відмінності. `.paloma.json` читається без `.ini`.
4. **Кольори з прозорістю** — `#rrggbbaa` у порядку CSS, а не ARGB Picasa (§4.4).
5. **Міграція** з поточного формату v1 (`SidecarService`, `SidecarFile`/`SidecarPhoto`/`EditDAG` у `shared/types.ts`) — у [детальному TODO](../paloma/detailed-todo.md), п. 4.4.

## 9. Відкриті питання

1. **Порядок ключів і стабільні дифи.** Пропозиція: `photos` сортувати за іменем, 2 пробіли відступу, LF, UTF-8 без BOM, запис атомарний (тимчасовий файл + `rename`).
2. **Імена файлів.** Ключі `photos` — точне ім'я на диску. Зіставлення без урахування регістру (як у Picasa на NTFS) потрібне лише при імпорті з `.ini`.
