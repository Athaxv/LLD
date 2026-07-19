# Rate Limiter

A Redis-backed HTTP rate limiter built with **Express**, **Bun**, and **TypeScript**. It demonstrates three classic limiting strategies — fixed window, sliding window, and token bucket — and why **Lua scripts** are needed for atomicity in production.

## What We Built

| Component | File | Description |
|-----------|------|-------------|
| Express server | `src/index.ts` | HTTP API on port `3000` with rate-limiting middleware |
| Redis client | `src/client.ts` | Shared `redis` client connected via `REDIS_URL` |
| Fixed window | `src/ratelimiter/fixedWindow.ts` | Counter per IP using `INCR` + `EXPIRE` |
| Sliding window | `src/ratelimiter/slidingWindow.ts` | Timestamp log per IP using a Redis **sorted set**, wrapped in a **Lua script** |
| Token bucket | `src/ratelimiter/tokenBucket.ts` | Smooth refill using a Redis **hash** (`token` + `lastRefillTime`); Lua script included for atomicity |
| Redis service | `docker-compose.yml` | Runs Redis 7 locally on port `6379` |

**Default limits:** fixed/sliding = 10 requests per 30s per IP; token bucket = capacity 10, refill 2 tokens/sec.

---

## Architecture

```
Client Request
      │
      ▼
 Express Middleware  ──►  Redis
 (fixed / sliding /        │
  token bucket)            ├─ Fixed:  STRING key  (counter)
                           ├─ Sliding: ZSET key   (timestamps)
                           └─ Token:   HASH key   (tokens + last refill)
```

Each client IP gets its own Redis key:

- Fixed window: `rate_limit:<ip>`
- Sliding window: `rate_limiter:<ip>`
- Token bucket: `rate_limiter:<ip>`

---

## Algorithms

### 1. Fixed Window (`fixedWindow.ts`)

Divides time into fixed buckets (e.g. 30-second windows). All requests in the same window share one counter.

**Flow:**

1. `INCR rate_limit:<ip>` — bump the counter
2. If the counter is `1`, set `EXPIRE` to the window length (30s)
3. If counter `> 10`, return `429 Too Many Requests`

**Pros:** Simple, fast, minimal memory (one integer per IP).

**Cons:** Burst at window boundaries — a client can send 10 requests at `0:29` and 10 more at `0:30`, effectively 20 in 2 seconds.

#### Redis Commands Used

| Command | Purpose |
|---------|---------|
| [`INCR`](https://redis.io/docs/latest/commands/incr/) | Atomically increments the request counter by 1 |
| [`EXPIRE`](https://redis.io/docs/latest/commands/expire/) | Sets a TTL (seconds) so the key auto-deletes after the window ends |

#### Production Issue (Non-Atomic)

`INCR` and `EXPIRE` are sent as **two separate round trips** from Node.js:

```
INCR key  →  (app receives result)  →  EXPIRE key 30
```

If the process crashes after `INCR` but before `EXPIRE`, the key has **no TTL** and becomes a stale counter that never resets.

#### Lua Fix (Commented in Code)

Run both commands inside one atomic Redis script:

```lua
local requests = redis.call("INCR", KEYS[1])

if requests == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
end

return requests
```

`EVAL` runs the entire script atomically — no other command can interleave between `INCR` and `EXPIRE`.

---

### 2. Sliding Window (`slidingWindow.ts`)

Tracks **individual request timestamps** instead of a single counter. Only requests within the last 30 seconds count toward the limit.

**Flow:**

1. Remove timestamps older than the window (`ZREMRANGEBYSCORE`)
2. Count remaining entries (`ZCARD`)
3. If count `>= limit`, reject
4. Otherwise, record this request (`ZADD`) and refresh TTL (`EXPIRE`)

#### Redis Commands Used

| Command | Purpose |
|---------|---------|
| [`ZREMRANGEBYSCORE`](https://redis.io/docs/latest/commands/zremrangebyscore/) | Removes sorted-set members with scores (timestamps) below the window start |
| [`ZCARD`](https://redis.io/docs/latest/commands/zcard/) | Returns how many requests are still inside the window |
| [`ZADD`](https://redis.io/docs/latest/commands/zadd/) | Adds the current request timestamp as score + unique member |
| [`EXPIRE`](https://redis.io/docs/latest/commands/expire/) | Auto-deletes the entire key if the IP goes idle |

#### Why a Sorted Set (ZSET)?

Redis sorted sets store `member → score` pairs where scores are sorted. Here:

- **Score** = request timestamp (`Date.now()`)
- **Member** = `"<timestamp>-<uuid>"` (unique per request, avoids collisions)

This lets us efficiently prune old entries and count recent ones.

#### Production Issue (Non-Atomic)

The naive version uses 4 separate commands (`ZREMRANGEBYSCORE` → `ZCARD` → `ZADD` → `EXPIRE`). Across multiple app servers, two requests can both read `count = 9` and both pass — allowing 11+ requests through.

#### Lua Script (Active Implementation)

All four steps run as **one atomic unit** via `EVAL`:

```lua
-- ARGV[1] = now          (current timestamp, used as ZADD score)
-- ARGV[2] = startWindow  (oldest timestamp still inside the window)
-- ARGV[3] = window       (TTL in seconds)
-- ARGV[4] = limit        (max requests allowed)
-- ARGV[5] = member       (unique request id)

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[2])

local count = redis.call("ZCARD", KEYS[1])

if count >= tonumber(ARGV[4]) then
    return -1   -- rate limited
end

redis.call("ZADD", KEYS[1], ARGV[1], ARGV[5])
redis.call("EXPIRE", KEYS[1], ARGV[3])

return count + 1   -- allowed; return new request count
```

**Return values:**

| Return | Meaning |
|--------|---------|
| `-1` | Request rejected — window is full |
| `N` (positive) | Request allowed — `N` requests now in the window |

**Why Lua?** Redis executes scripts atomically. While the script runs, no other client's commands can interleave — critical when multiple server instances share the same Redis.

---

### 3. Token Bucket (`tokenBucket.ts`)

Models each IP as a bucket that holds tokens. Tokens refill continuously over time. Each request costs 1 token; if none are left, the request is rejected.

**Defaults:** `capacity = 10`, `refillRate = 2` tokens/second.

**Flow:**

1. Read bucket state from a Redis hash (`token`, `lastRefillTime`)
2. Compute elapsed time and refill: `tokens = min(capacity, tokens + elapsed * refillRate)`
3. If `tokens >= 1`, consume one and allow; otherwise return `429`
4. Persist updated state with `HSET` and set idle `EXPIRE`

**Pros:** Allows short bursts up to capacity while enforcing a steady average rate. Feels smoother than fixed windows.

**Cons:** Needs careful atomic updates across read → refill → consume → write.

#### Redis Commands Used

| Command | Purpose |
|---------|---------|
| [`HMGET`](https://redis.io/docs/latest/commands/hmget/) / [`HGETALL`](https://redis.io/docs/latest/commands/hgetall/) | Read current token count and last refill timestamp |
| [`HSET`](https://redis.io/docs/latest/commands/hset/) | Write updated token count and refill time |
| [`EXPIRE`](https://redis.io/docs/latest/commands/expire/) | Drop inactive buckets (e.g. after 1 hour) |

#### Production Issue (Non-Atomic)

The active middleware path uses separate `hGetAll` / `hSet` round trips. Two concurrent requests can both read the same token count and both pass — overspending the bucket.

#### Lua Script (Included in File)

Wrap refill + consume in one atomic script:

```lua
-- ARGV[1] = now (ms)
-- ARGV[2] = capacity
-- ARGV[3] = refillRate (tokens per second)

local data = redis.call("HMGET", KEYS[1], "token", "lastRefillTime")
-- initialize or refill, then consume 1 token if available
-- HSET updated state + EXPIRE 3600
-- return 1 (allowed) or 0 (rejected)
```

Wire it with `client.eval(tokenBucketScript, { keys: [key], arguments: [...] })` when you want multi-server safety.

---

## Response Headers

The fixed-window middleware sets:

| Header | Description |
|--------|-------------|
| `X-rateLimit-Limit` | Max requests allowed per window |
| `X-remaining-limit` | Requests remaining in the current window |

The sliding-window middleware sets:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests allowed per window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com/) (for Redis)

### 1. Start Redis

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
bun install
```

### 3. Run the server

```bash
bun run src/index.ts
```

By default, `src/index.ts` uses the **fixed window** middleware. To switch algorithms:

```typescript
// src/index.ts
import { slidingWindow } from "./ratelimiter/slidingWindow";
import { TokenBucket } from "./ratelimiter/tokenBucket";

app.use(slidingWindow);  // or TokenBucket, instead of rateLimiter
```

### 4. Test

```bash
curl http://localhost:3000/
```

Send more than 10 requests within 30 seconds to trigger a `429` response.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

When running the app inside Docker alongside the Redis service, use `redis://redis:6379`.

---

## Project Structure

```
rate-limiter/
├── src/
│   ├── index.ts                  # Express entry point
│   ├── client.ts                 # Redis client singleton
│   └── ratelimiter/
│       ├── fixedWindow.ts        # INCR + EXPIRE (fixed window)
│       ├── slidingWindow.ts      # ZSET + Lua (sliding window)
│       └── tokenBucket.ts        # HASH + Lua (token bucket)
├── docker-compose.yml            # Redis 7 service
├── package.json
└── tsconfig.json
```

---

## Algorithm Comparison

| | Fixed Window | Sliding Window | Token Bucket |
|---|-------------|----------------|--------------|
| **Storage** | String (integer) | Sorted set (timestamps) | Hash (tokens + time) |
| **Memory** | O(1) per IP | O(limit) per IP | O(1) per IP |
| **Accuracy** | Can allow 2× burst at boundaries | Smooth, no boundary burst | Smooth average rate + burst capacity |
| **Atomicity** | Needs Lua (`INCR` + `EXPIRE`) | Needs Lua (4 commands) | Needs Lua (`HMGET` → refill → `HSET`) |
| **Complexity** | Low | Medium | Medium |
