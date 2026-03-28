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

### Обновить конфиг (shallow merge)

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

### Удалить конфиг

```
DELETE /api/v1/config/nodes/:nodeId
DELETE /api/v1/config/consulates/:id
DELETE /api/v1/config/bots/:botId
```

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
