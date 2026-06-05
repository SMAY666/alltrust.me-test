# Payment Service (AllTrustMe test task)

Небольшой сервис приёма платежей: создание счетов (invoice), приём webhook от платёжной системы и получение статуса оплаты.

## Стек

- Node.js + Express
- MongoDB (Mongoose)
- Redis
- TypeScript
- Jest + Supertest (тесты)

## Требования

- Node.js 20+
- MongoDB
- Redis

## Быстрый старт

```bash
yarn install
```

Создайте файл `.env` в корне проекта:

```env
HOST=127.0.0.1
PORT=8001

MONGO_URL=mongodb://127.0.0.1:27017/alltrustme
REDIS_URL=redis://127.0.0.1:6379

# Окно допустимого времени webhook-запроса (мс)
TIMESTAMP_WINDOW=300000

# Секрет для HMAC-SHA256 подписи webhook
MERCHANT_SECRET=your-webhook-secret
```

Сборка и запуск:

```bash
yarn build
yarn start
```

Сервер поднимается на `http://127.0.0.1:8001`.

## Тесты

```bash
yarn test
```

Тесты используют in-memory MongoDB (`mongodb-memory-server`) и mock Redis — внешние сервисы для прогона не нужны.

Покрыто:

- расчёт комиссии (`fee`, `amountToReceive`);
- проверка подписи webhook;
- идемпотентность (повтор nonce, повторный `paid` webhook);
- HTTP-эндпоинты (`POST /invoice`, `POST /webhook`, `GET /invoice/:id`).

## API

### POST /invoice — создание счёта

**Тело запроса:**

```json
{
  "amount": 100,
  "currency": "USD",
  "merchantId": "<merchant-id>"
}
```

**Ответ (201):**

```json
{
  "invoiceId": "...",
  "amount": "100",
  "fee": "3",
  "amountToReceive": "97"
}
```

Формулы:

- `fee = amount × feePercent` (процент берётся из настроек мерчанта);
- `amountToReceive = amount − fee`.

Счёт сохраняется в MongoDB со статусом `pending`.

> При первом запуске создаётся тестовый мерчант с `feePercent = 0.03`. Его `merchantId` можно получить из MongoDB (коллекция `merchants`).

---

### POST /webhook — статус оплаты

**Заголовки:**

| Заголовок     | Описание                                      |
|---------------|-----------------------------------------------|
| `X-Signature` | HMAC-SHA256 от JSON-тела запроса              |
| `X-Timestamp` | Unix timestamp (мс)                           |
| `X-Nonce`     | Уникальный идентификатор запроса              |

**Тело запроса:**

```json
{
  "invoiceId": "...",
  "status": "paid"
}
```

`status`: `paid` | `failed`

**Пример формирования подписи (Node.js):**

```javascript
import crypto from 'crypto';

const body = { invoiceId: '...', status: 'paid' };
const secret = process.env.MERCHANT_SECRET;

const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(body))
  .digest('hex');
```

**Ответ:** `200 OK` (пустое тело)

**Проверки:**

1. Наличие обязательных заголовков.
2. Актуальность `X-Timestamp` (в пределах `TIMESTAMP_WINDOW`).
3. Корректность HMAC-SHA256 подписи (`timingSafeEqual`).
4. Уникальность `X-Nonce` через Redis (`SET NX` с TTL).

Повторная доставка с тем же nonce → `401 Conflict`.

---

### GET /invoice/:id — статус счёта

**Ответ (200):**

```json
{
  "status": "pending"
}
```

Возможные статусы: `pending`, `paid`, `failed`.

## Структура проекта

```
src/
├── brokers/          # MongoDB, Redis
├── constants/        # переменные окружения
├── modules/
│   ├── invoice/      # счета, webhook, роуты
│   └── merchant/     # мерчанты и feePercent
├── test/             # хелперы для тестов
└── utils/            # HttpError
```

## Допущения

1. **Мерчант** — при старте создаётся один тестовый мерчант. Отдельного API для управления мерчантами нет (не входило в ТЗ).
2. **Деньги** — расчёты выполняются через `decimal.js`, чтобы избежать ошибок floating point.
3. **Подпись webhook** — HMAC-SHA256 от канонического `JSON.stringify(body)` без пробелов. В продакшене стоит зафиксировать канонизацию JSON отдельно.
4. **Nonce** — хранится в Redis 5 минут. Повтор с тем же nonce отклоняется.
5. **Идемпотентность статуса** — обновление счёта выполняется только из `pending`; повторный `paid` webhook с новым nonce не меняет уже оплаченный счёт.
6. **Аутентификация** — не реализована (не входило в ТЗ).

## Что доделал бы при большем времени

1. **Зачисление средств мерчанту** — атомарное `findOneAndUpdate` + `$inc balance` в MongoDB-транзакции, поле `creditedAt` на invoice для гарантии однократного зачисления.
2. **Middleware обработки ошибок** — единый обработчик `HttpError` в Express (сейчас есть в тестовом приложении, но не в `server.ts`).
3. **Конкурентные webhook** — optimistic locking / версионирование документа для гонок при одновременных запросах.
4. **Валидация входных данных** — схемы (zod/joi) для `amount > 0`, допустимых валют, формата `merchantId`.
5. **API мерчантов** — CRUD для `feePercent`, получение `merchantId` без прямого доступа к БД.
6. **Логирование и метрики** — structured logs, trace id для webhook.
7. **`.env.example`** — шаблон конфигурации в репозитории.
