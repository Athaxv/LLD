import type { NextFunction, Request, Response } from "express";
import client from "../client";

const capacity = 10;
const refillRate = 2;

const tokenBucketScript = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local capacity = tonumber(ARGV[2])
    local refillRate = tonumber(ARGV[3])

    -- Get current bucket state
    local data = redis.call(
        "HMGET",
        key,
        "token",
        "lastRefillTime"
    )

    local tokens
    local lastRefillTime

    -- Initialize bucket if it doesn't exist
    if data[1] and data[2] then
        tokens = tonumber(data[1])
        lastRefillTime = tonumber(data[2])
    else
        tokens = capacity
        lastRefillTime = now
    end

    -- Calculate how much time has passed
    local elapsed = (now - lastRefillTime) / 1000

    -- Calculate newly generated tokens
    local tokensToAdd = elapsed * refillRate

    -- Refill bucket without exceeding capacity
    local currentTokens = math.min(
        capacity,
        tokens + tokensToAdd
    )

    local allowed = 0

    -- Consume one token if available
    if currentTokens >= 1 then
        currentTokens = currentTokens - 1
        allowed = 1
    end

    -- Save updated bucket state
    redis.call(
        "HSET",
        key,
        "token", currentTokens,
        "lastRefillTime", now
    )

    -- Remove inactive buckets eventually
    redis.call(
        "EXPIRE",
        key,
        3600
    )

    return allowed
`;

export async function TokenBucket(req: Request, res: Response, next: NextFunction){
    const ip = req.ip;

    const key = `rate_limiter:${ip}`

    let token: number;
    let lastRefillTime: number;

    const data = await client.hGetAll(key);

    if (data.token){
        token = Number(data.token)
        lastRefillTime = Number(data.lastRefillTime)
    }
    else {
        token = capacity
        lastRefillTime = Date.now();
    }

    const now = Date.now();

    const elapsed = (now - lastRefillTime) / 1000;

    const tokenToAdd = elapsed * refillRate;

    var currentTokens = Math.min(capacity, token + tokenToAdd)

    lastRefillTime = now;

    if (currentTokens >= 1){
        currentTokens -= 1;

        await client.hSet(key, {
            token: currentTokens,
            lastRefillTime: lastRefillTime
        })

        return next();
    }
    
    await client.hSet(key, {
        token: token,
        lastRefillTime: now
    })

    return res.status(429).json({
        message: "Rate limited!, bitch"
    })
}