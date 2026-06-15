# vsr-config

HTTP-сервис для хранения и раздачи иерархической конфигурации ботов. Порт **3200**.

## Запуск

```bash
npm install
node index.js          # продакшн
node --watch index.js  # dev-режим с авторестартом
```

## Иерархия конфигурации

Конфиг для бота собирается из четырёх уровней. Каждый следующий перекрывает предыдущий:

```
defaults → node → consulate → bot
```

| Уровень     | Что хранит                                  |
|-------------|---------------------------------------------|
| `defaults`  | Общие параметры для всех ботов              |
| `node`      | Параметры машины/сервера (прокси, потоки)   |
| `consulate` | Параметры консульства (даты, настройки)     |
| `bot`       | Индивидуальные параметры конкретного бота   |

## API

### Получить конфиг бота

```
GET /api/v1/bot-config/:botId?nodeId=X&consulate=Y
```

Возвращает смёрженный конфиг и источники каждого ключа.

```bash
curl 'http://localhost:3200/api/v1/bot-config/m416-cy_hu-1?nodeId=m416&consulate=cy_hu'
```

```json
{
  "config": {
    "retryDelay": 5000,
    "proxy": "residential-eu",
    "appointmentDate": "2026-05-20"
  },
  "sources": {
    "defaults":  { "retryDelay": 5000 },
    "node":      { "proxy": "residential-eu" },
    "consulate": { "appointmentDate": "2026-05-15" },
    "bot":       { "appointmentDate": "2026-05-20" }
  }
}
```

### Посмотреть всё содержимое

```
GET /api/v1/config/raw
```

Включает `revisions` и `modifiedBy` (см. разделы «Конкурентность» и «Атрибуция»).

### Ревизии (лёгкий поллинг)

```
GET /api/v1/config/revisions
→ {
    "revisions":  { "bots/m416-cy_hu-1": 4 },
    "modifiedBy": { "bots/m416-cy_hu-1": { "user": "Anna", "at": "2026-06-16T11:30:00.000Z" } }
  }
```

Отдаёт только карту ревизий и атрибуцию (из памяти, сотни байт). Фронтенд раз в минуту проверяет, не устарели ли локальные данные.

### Обновить конфиг — частично (shallow merge)

```
PATCH /api/v1/config/defaults
PATCH /api/v1/config/nodes/:nodeId
PATCH /api/v1/config/consulates/:id
PATCH /api/v1/config/bots/:botId
```

```bash
# Установить дефолтный retryDelay
curl -X PATCH http://localhost:3200/api/v1/config/defaults \
  -H 'Content-Type: application/json' \
  -d '{"retryDelay": 5000}'

# Задать прокси для ноды m416
curl -X PATCH http://localhost:3200/api/v1/config/nodes/m416 \
  -H 'Content-Type: application/json' \
  -d '{"proxy": "residential-eu", "maxThreads": 2}'

# Задать дату для консульства cy_hu
curl -X PATCH http://localhost:3200/api/v1/config/consulates/cy_hu \
  -H 'Content-Type: application/json' \
  -d '{"appointmentDate": "2026-05-15"}'

# Переопределить дату для конкретного бота
curl -X PATCH http://localhost:3200/api/v1/config/bots/m416-cy_hu-1 \
  -H 'Content-Type: application/json' \
  -d '{"appointmentDate": "2026-05-20"}'
```

### Обновить конфиг — целиком (full replace)

```
PUT /api/v1/config/defaults
PUT /api/v1/config/nodes/:nodeId
PUT /api/v1/config/consulates/:id
PUT /api/v1/config/bots/:botId
PUT /api/v1/reserved-dates        # тело — JSON-массив
```

Полностью заменяет объект секции (в отличие от `PATCH`, который мёржит). Админ-панель использует именно `PUT`, чтобы можно было удалять ключи.

### Удалить конфиг

```
DELETE /api/v1/config/nodes/:nodeId
DELETE /api/v1/config/consulates/:id
DELETE /api/v1/config/bots/:botId
```

### Конкурентность (оптимистичная блокировка)

Чтобы правки двух админов не затирали друг друга, каждый ресурс (`defaults`, `reservedDates`, `nodes/<id>`, `consulates/<id>`, `bots/<id>`) имеет счётчик ревизии. Ревизии отдаются в `/config/raw` и `/config/revisions`.

При записи клиент передаёт ревизию, которую загрузил, в заголовке `If-Match`. Если она устарела (кто-то успел изменить ресурс) — сервер отвечает **409**:

```bash
curl -X PUT http://localhost:3200/api/v1/config/bots/m416-cy_hu-1 \
  -H 'Content-Type: application/json' -H 'If-Match: 4' \
  -d '{"appointmentDate": "2026-05-20"}'
# → 409 { "code": "REVISION_MISMATCH", "resource": "bots/m416-cy_hu-1", "current": 5 }
```

Без заголовка `If-Match` (или `If-Match: *`) проверка пропускается — так создаются новые ключи и делается «сохранить поверх».

### Атрибуция (кто менял)

Каждая мутация принимает заголовок `X-User` (его проставляет прокси Tgstat из сессии). Сервис сохраняет `modifiedBy[<ресурс>] = { user, at }` и пишет автора в снапшоты истории. Если заголовка нет — автор `"unknown"`.

### История версий

```
GET    /api/v1/history                 # список снапшотов (с автором и временем)
POST   /api/v1/history/snapshot        # { name } — именованный снапшот
POST   /api/v1/history/:id/restore     # восстановить состояние
DELETE /api/v1/history/:id             # удалить снапшот
```

Перед каждой записью автоматически создаётся авто-снапшот (хранится последних 10; именованные не вытесняются).

### Health check

```
GET /health
→ { "status": "ok" }
```

## Формат данных (data/bots.json)

```json
{
  "defaults": { "retryDelay": 5000 },
  "nodes": {
    "m416": { "proxy": "residential-eu", "maxThreads": 2 }
  },
  "consulates": {
    "cy_hu": { "appointmentDate": "2026-05-15" }
  },
  "bots": {
    "m416-cy_hu-1": { "appointmentDate": "2026-05-20" }
  }
}
```

Файл создаётся автоматически при первой записи. Каждое изменение сразу сохраняется на диск.

## Деплой

Деплой запускается пушем тега:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

Требуются GitHub Secrets: `SERVER_HOST`, `SERVER_SSH_KEY`.

Структура на сервере:

```
/var/www/.../vsr-config/
├── current/      → симлинк на активный релиз
├── releases/
│   └── v1.2.3/
└── shared/
    └── data/     → bots.json хранится здесь (персистится между релизами)
```

## История изменений

- **v1.1.4** — атрибуция изменений (`X-User` → `modifiedBy`, автор в снапшотах истории); лёгкий эндпоинт `GET /config/revisions` для поллинга.
- **v1.1.3** — оптимистичная блокировка против потери обновлений: per-resource ревизии + заголовок `If-Match`, ответ `409 REVISION_MISMATCH` при конфликте.
- **v1.1.x** — флаг `disabled` на уровнях, фильтрация reservedDates, уведомление distributor при записи.
- **v1.0.x** — базовый CRUD, `PUT` (full replace) в дополнение к `PATCH`, история снапшотов.
