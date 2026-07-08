import type { NextFunction, Request, Response } from "express";
import client from "../client";

const limit = 10;
const window = 30;

export async function rateLimiter(req: Request, res: Response, next: NextFunction){
    const ip = req.ip;

    const key = `rate_limit:${ip}`

    const requests = await client.incr(key);

    if (requests == 1) await client.expire(key, window)
    // Production Issue:
    //
    // INCR and EXPIRE are executed as two separate commands.
    // After Redis executes INCR, the application receives the result,
    // decides whether to call EXPIRE, and then sends another command.
    //
    // If the Node.js process crashes after INCR succeeds but before
    // EXPIRE is sent, the key never receives a TTL and becomes a stale key.

    // Lua Script (Atomic)
    // local requests = redis.call("INCR", KEYS[1])

    // if requests == 1 then 
    //     redis.call("EXPIRE", KEYS[1], ARGV[1])
    // end

    // Replace the Node.js with this
    // const requests = await client.eval(luaScript, {
    //     keys: [key],
    //     arguments: [String(window)],
    // });

    // return requests

    const remaining = Math.max(0, limit - requests)

    res.set({
            "X-rateLimit-Limit": String(limit),
            "X-remaining-limit": String(remaining)
    })

    if (requests > limit){
        return res.status(429).json({
            message: "Too many request bitch!",
            remaining: 0
        })
    }

    next();
}