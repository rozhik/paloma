# Immich — користувачі, авторизація та права

> Знімок на **2026-10-10**. Джерела: [User Management](https://docs.immich.app/administration/user-management), [OAuth](https://docs.immich.app/administration/oauth), [Sharing](https://docs.immich.app/features/sharing), [Partner Sharing](https://docs.immich.app/features/partner-sharing), [User Settings](https://docs.immich.app/features/user-settings), [System Settings](https://docs.immich.app/administration/system-settings), код `server/src/services/auth.service.ts` / `server/src/enum.ts` (Permission).  
> Порівняння з API Paloma загалом: [07-immich-api-comparison.md](07-immich-api-comparison.md).  
> Файли / папки / дублікати Immich: [08-immich-files-folders-duplicates.md](08-immich-files-folders-duplicates.md).

Це **невизначена пропозиція / референс**, не контракт Paloma (див. `AGENTS.md`).

---

## 1. Короткий вердикт

Immich — **мультикористувацький** self-hosted сервіс: кожен акаунт має власну бібліотеку; admin керує користувачами й системними налаштуваннями; доступ до API йде через сесію (Bearer / cookie), API key зі scopes або shared-link ключ.

| Шар | Що це в Immich |
| :--- | :--- |
| **Identity** | User (admin \| звичайний), квота, storage label, OAuth claims |
| **Authentication** | Password, OIDC/OAuth, session token, API key, shared-link key/slug |
| **Authorization (роль)** | `isAdmin` → admin-only маршрути; інакше доступ до власних ресурсів |
| **Authorization (scopes)** | `Permission.*` на API keys (напр. `asset.read`, `album.share`, `all`) |
| **Sharing** | Shared album (editor/viewer), Partner (вся бібліотека), Public shared link |

**Paloma зараз:** auth відсутній; одна локальна бібліотека; немаєж HTTP-користувачів. Для майбутнього мережевого доступу з Immich ближчі ідеї **API key + scopes** і простий admin/user, ніж повний OAuth + partners.

---

## 2. Модель користувачів

### 2.1 Ролі

Лише дві ролі на рівні інстансу:

| Роль | Як з’являється | Що може |
| :--- | :--- | :--- |
| **Admin** | Перший зареєстрований користувач (`POST /auth/admin-sign-up`); також через OAuth claim `immich_role=admin` | Керувати users, system settings, jobs, server config; усе, що може звичайний user |
| **User** | Створює admin (`POST /admin/users`) або auto-register через OAuth | Власна бібліотека, API keys, sessions, sharing у межах свого акаунта |

Немає «модератора», «read-only user на весь сервер» чи RBAC з дохвільними ролями — дрібнозернистість є лише в **API key permissions** і в **ролях шарингу** (album editor/viewer).

### 2.2 Життєвий цикл акаунта (admin)

1. **Register admin** — один раз на порожньому інстансі.
2. **Create user** — Administration → Users; опційно welcome email (якщо SMTP).
3. **Storage quota (GiB)** — ліміт upload; порожнє = unlimited; external libraries **не** рахуються в квоту.
4. **Storage label** — підстановка в storage template замість `userId` (`upload/{label}/…`); для старих файлів — Storage Migration Job.
5. **Password reset** — admin скидає на випадковий пароль; user змінює при наступному вході.
6. **Delete** — акаунт одразу disabled; дані видаляються після delay (default **7 днів**, midnight job) або **immediately** (незворотно).

Релевантні маршрути (група Admin Users):

| Операція | Immich |
| :--- | :--- |
| Створити / список / get / update / delete | `POST/GET/PUT/DELETE /admin/users`, `GET /admin/users/{id}` |
| Звичайний список інших users (для шерингу) | `GET /users` |
| Профіль себе | Users API: profile, preferences, onboarding, license, avatar |

### 2.3 Власні налаштування user

Account Settings: профіль, feature toggles, **API keys**, **logged-in devices (sessions)**, статистика використання, partner sharing, PIN для locked assets.

---

## 3. Автентифікація: як клієнт доводить особу

### 3.1 Канали (порядок перевірки в `AuthService.validate`)

```
Request
   |
   +--> x-immich-share-key / ?key=     --> Shared link auth
   +--> x-immich-share-slug / ?slug=   --> Shared link auth
   +--> Bearer | cookie immich_access_token
   |    | x-immich-user-token | x-immich-session-token | ?sessionKey=
   |                              --> Session (user login)
   +--> x-api-key / ?apiKey=           --> API key (+ Permission check)
   |
   v
Unauthorized, якщо нічого не підійшло
```

OpenAPI security schemes (практично):

| Схема | Header / cookie | Призначення |
| :--- | :--- | :--- |
| Bearer / cookie | `Authorization: Bearer …` або `immich_access_token` | Web/mobile session після login/OAuth |
| API key | `x-api-key` | CLI, автоматизації, зовнішні клієнти |
| Shared link | `x-immich-share-key` / slug | Публічний доступ без акаунта |

Shared-link auth **не** відкриває звичайні маршрути — лише ті, позначені як `sharedLinkRoute`.

### 3.2 Password login

- `POST /auth/login` — email/password → access token + cookies.
- `POST /auth/logout`, `POST /auth/change-password`.
- Admin може **вимкнути password auth** для всього інстансу (System Settings). Існуючі сесії лишаються; нові password-login блокуються. Якщо вимкнено й password, і OAuth — увійти неможливо (відновлення через Server CLI).

### 3.3 OAuth / OIDC

- Стандартний **Authorization Code** + confidential web client.
- Налаштування: Administration → Settings (issuer, client_id/secret, scopes, signing algs, button text, auto-launch, mobile redirect override).
- Маршрути: `POST /oauth/authorize`, `POST /oauth/callback`, link/unlink, backchannel logout.
- Claims (на реєстрації + sync при наступних логінах, з нюансами для storage label):

| Claim (default name) | Ефект |
| :--- | :--- |
| `immich_role` | `"user"` \| `"admin"` |
| `immich_quota` | квота в GiB (`-1` unlimited, `0` block uploads) |
| `preferred_username` (storage label) | label у storage template; з default claim оновлюється лише на register |

- **Auto Register** — перший OAuth-логін створює user.
- **Auto Launch** — login page одразу редіректить на IdP (`?autoLaunch=0` щоб побачити форму).

Провайдери з офіційних прикладів: Authelia, Authentik, Google, Keycloak, Okta тощо.

### 3.4 Sessions (пристрої)

- Після login створюється session; список/відкликання в Account Settings і через Sessions API (`session.create|read|update|delete|lock` permissions).
- Headers альтернативи cookie: `x-immich-user-token`, `x-immich-session-token`.

### 3.5 PIN і «elevated» сесія (locked assets)

Окремо від login-пароля:

| Крок | API | Ефект |
| :--- | :--- | :--- |
| Setup / change / delete PIN | `POST/PUT/DELETE …/auth/pin-code` (permissions `pinCode.*`) | PIN на акаунті |
| Unlock | `POST /auth/session/unlock` `{ pinCode }` | `pinExpiresAt` ≈ **+15 хв** — доступ до locked assets |
| Lock | `POST /auth/session/lock` | зняти elevated |
| Status | `GET /auth/status` | чи є PIN, чи сесія elevated |

Лише для **session** token (не для чистого API key). Mobile може зберігати PIN у secure storage + biometric → auto-unlock.

### 3.6 API keys

- Створює user у Account Settings або `POST /api-keys` з обов’язковим `permissions: Permission[]`.
- Повний доступ: `["all"]`. Інакше — лише перелічені scopes.
- Rotate: окремий permission `apiKey.rotate`.
- Ключ, яким створюють інший ключ, **не може видати прав більше**, ніж має сам.
- Маршрути **без** явного permission вимагають `all` (зміна поведінки ~1.136+): вузький key більше не проходить «тихі» admin/utility endpoints.

---

## 4. Авторизація та права

### 4.1 Два ортогональні механізми

```
+------------------+     +---------------------------+
|  User.isAdmin    |     |  ApiKey.permissions[]     |
|  (admin routes)  |     |  (granular scopes)        |
+--------+---------+     +-------------+-------------+
         |                             |
         v                             v
   Forbidden, якщо              Forbidden, якщо
   adminRoute && !isAdmin       requested ∉ granted
         |                             |
         +-------------+---------------+
                       v
              Resource ownership /
              share / partner checks
              (requireAccess …)
```

1. **Admin gate** — metadata `adminRoute` на Nest endpoint.
2. **API key scopes** — `Permission` enum; session-користувач (після login) зазвичай має повний доступ у межах свого user (scopes перевіряються саме для apiKey).
3. **Resource ACL** — чи належить asset/album user’у, чи відкритий через album share / partner / shared link.

### 4.2 Permission enum (групи)

Формат: `domain.action` (напр. `asset.read`). Повний список у `server/src/enum.ts`. Групи:

| Група | Приклади permissions |
| :--- | :--- |
| Meta | `all` |
| Activity | `activity.create\|read\|update\|delete\|statistics` |
| API key | `apiKey.create\|read\|update\|delete\|rotate` |
| Asset | `asset.read\|update\|delete\|share\|view\|download\|upload\|copy\|derive\|statistics` + `asset.edit.*`, `assetFile.*` |
| Album | `album.*`, `albumAsset.*`, `albumUser.*` |
| Auth / devices | `auth.changePassword`, `authDevice.delete`, `session.*`, `pinCode.*` |
| People / faces | `person.*`, `face.*` |
| Partner / shared link | `partner.*`, `sharedLink.*` |
| Library / timeline / map | `library.*`, `timeline.*`, `map.*`, `folder.read` |
| Admin | `adminUser.*`, `adminConfig.*`, `adminSession.read`, `adminAuth.unlinkAll`, `systemConfig.*`, … |
| Jobs / sync / workflows | `job.*`, `queue.*`, `sync.*`, `workflow.*`, `plugin.*` |
| Інше | tags, memories, stacks, duplicates, notifications, backups, server.*, licenses, … |

Для інтеграцій (CLI upload, Home Assistant, Immich Frame тощо) типово беруть мінімальний набір (`asset.upload`, `asset.read`, …) або `all`, якщо endpoint ще не розмічений.

### 4.3 Album roles (між users одного інстансу)

```typescript
enum AlbumUserRole {
  Owner = 'owner',
  Editor = 'editor',   // view + add own assets
  Viewer = 'viewer',   // read-only
}
```

Шарінг альбому: share icon → вибір users → editor або viewer. Permissions на рівні API key: `albumUser.create|update|delete`, `album.share`.

### 4.4 Partner sharing (вся бібліотека)

Одностороннє: A додає B як partner → B бачить бібліотеку A.

| Включає | Не включає |
| :--- | :--- |
| Усі non-archived, non-trashed assets | Favorites flag |
| Метадані, включно з GPS | People / face recognition data |
| Можливість далі шарити (links, albums) | Уже існуючі partner albums |
| Опційно «Show in timeline» | Видалення чужих asset’ів (немає curator-ролі) |

Дублікати детектяться per-user → у спільному timeline можливі «подвійні» фото. API: `POST/GET/PUT/DELETE /partners` (`partner.*`).

### 4.5 Public shared links

Для людей **без** акаунта Immich.

| Тип | Зміст |
| :--- | :--- |
| `ALBUM` | цілий альбом |
| `INDIVIDUAL` | набір asset ids |

Опції: expiresAt, password, allowUpload, allowDownload, showMetadata/Exif, slug. URL містить довгий random key (секрет). Auth через share key/slug; password-link додатково `POST /shared-links/login` → token cookie `immich_shared_link_token`.

Створення вимагає `album.share` / `asset.share` + ownership.

### 4.6 Cluster groups (people across users)

Окремий контур спільного розпізнавання людей між users (`clusterGroup.*`) — не ACL на фото, а спільний face-cluster простір. Згадано тут лише як суміжний permission-домен.

---

## 5. Карта HTTP-поверхні (auth / users / rights)

| Домен | Префікс / група | Примітки |
| :--- | :--- | :--- |
| Auth | `/auth/*` | login, logout, change-password, admin-sign-up, status, pin, session lock/unlock |
| OAuth | `/oauth/*` | authorize, callback, link, unlink, backchannel-logout, mobile-redirect |
| Sessions | `/sessions` (і admin sessions) | список пристроїв, revoke |
| API keys | `/api-keys` | CRUD + rotate, поле `permissions` |
| Users (self / search) | `/users` | профіль, search для шерингу |
| Users (admin) | `/admin/users` | CRUD, quota, delete delay semantics |
| Partners | `/partners` | library-level share |
| Shared links | `/shared-links` | public links + login |
| Album users | частина `/albums` | editor/viewer |

---

## 6. Що з цього релевантно для Paloma

| Ідея Immich | Для Paloma |
| :--- | :--- |
| Немає auth на localhost | **Залишити** як default (див. порівняння §3 у `07`) |
| API key + scopes | Найближча модель, якщо з’явиться remote/LAN API |
| Admin vs User | Достатньо для home NAS; повний IdP — overkill для desktop |
| OAuth/OIDC | Лише якщо Paloma стане shared server для сім’ї з існуючим IdP |
| Album editor/viewer | Корисно як модель «сімейного альбому», не як копія API |
| Partner = вся бібліотека | Важко узгодити з sidecar-per-folder і single-library філософією |
| Shared links | Окремий продуктний напрям (експорт посилань), не MVP |
| PIN / elevated session | Близько до [complexity levels / Child PIN](../complexity-levels.md) Paloma — інша мета (UI safety vs locked assets), але схожий UX-патерн |
| Storage quota / multi-library per user | Поза моделлю «папки на диску одного ПК» |

**Практична рекомендація:** не тягнути users/OAuth у MVP; якщо колись знадобиться мережевий доступ — спроектувати тонкий шар **session або API key + невеликий Permission enum** під реальні маршрути Paloma, а не імпортувати весь `Permission` Immich.

---

## 7. Посилання

- User Management: https://docs.immich.app/administration/user-management  
- OAuth: https://docs.immich.app/administration/oauth  
- Sharing: https://docs.immich.app/features/sharing  
- Partner Sharing: https://docs.immich.app/features/partner-sharing  
- User Settings (API keys, devices): https://docs.immich.app/features/user-settings  
- System Settings (password/OAuth toggles, delete delay): https://docs.immich.app/administration/system-settings  
- Permission enum (source): https://github.com/immich-app/immich/blob/main/server/src/enum.ts  
- Auth service (source): https://github.com/immich-app/immich/blob/main/server/src/services/auth.service.ts  
- Immich ↔ Paloma API overview: [07-immich-api-comparison.md](07-immich-api-comparison.md)  
- Immich files / folders / duplicates: [08-immich-files-folders-duplicates.md](08-immich-files-folders-duplicates.md)
