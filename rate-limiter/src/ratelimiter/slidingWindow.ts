import type { NextFunction, Request, Response } from "express";
import client from "../client";
import { randomUUIDv5 } from "bun";

const limit = 10;
const window = 30;

export async function slidingWindow(req: Request, res: Response, next: NextFunction){
    const ip = req.ip;
    const key = `rate_limiter:${ip}`

    const now = Date.now()
    const startWindow = now - window * 1000;

    // Individual Redis commands are atomic.
    //
    // However, the Sliding Window algorithm consists of multiple
    // commands (remove → count → decide → insert → expire).
    //
    // If these commands are executed separately, another request
    // can observe stale state between them.
    //
    // Executing the entire algorithm as a Lua script makes the
    // whole rate limiter atomic.
    // but the current algorithm is not atomic, in different servers it can create bug, 
    // as the current algorithm does not executes these 4 round calls as itself one call
    // so we need to add Lua to it

    // await client.zRemRangeByScore(key, 0, startWindow)

    // const count = await client.zCard(key)

    // if (count >= limit){
    //     return res.status(429).json({
    //         message: "You are rate limited bitch!"
    //     })
    // }

    // await client.zAdd(key, {
    //     score: now,
    //     value: `${now}-${randomUUIDv5}`
    // })

    // await client.expire(key, window)

    const luaScript = `
        redis.call(
            "ZREMRANGEBYSCORE",
            KEYS[1],
            "-inf",
            ARGV[2]
        )

        local count = redis.call(
            "ZCARD",
            KEYS[1]
        )

        if count >= tonumber(ARGV[4]) then
            return -1
        end

        redis.call(
            "ZADD",
            KEYS[1],
            ARGV[1],
            ARGV[5]
        )

        redis.call(
            "EXPIRE",
            KEYS[1],
            ARGV[3]
        )

        return count + 1
    `;

    const count = await client.eval(luaScript, {
        keys: [key],
        arguments: [
            String(now),
            String(startWindow),
            String(window),
            String(limit),
            `${now}-${randomUUIDv5}`
        ]
    });

    if (Number(count) === -1) {
        return res.status(429).json({
            message: "You are rate limited!",
            remaining: 0
        });
    }

    const remaining = Math.max(0, limit - Number(count));

    res.set({
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining)
    });

    next();
}