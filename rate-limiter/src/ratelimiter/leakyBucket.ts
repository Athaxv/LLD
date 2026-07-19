import type { NextFunction, Request, Response } from "express";
import client from "../client";

const capacity = 10
const leakRate = 2;

export async function leakyBucket(req: Request, res: Response, next: NextFunction){
    try {
        const ip = req.ip;

        const key = `rate_limiter:${ip}`

        const data = await client.hGetAll(key);

        let currentLevel: number;
        let lastLeakTime: number;

        if (!data.currentLevel){
            currentLevel = 0;
            lastLeakTime = Date.now();
        }
        else {
            currentLevel = Number(data.currentLevel);
            lastLeakTime = Number(data.lastLeakTime);
        }

        const now = Date.now();

        const elapsed = (now - lastLeakTime) / 1000;

        const leaked = elapsed * leakRate;

        currentLevel = Math.max(0, currentLevel - leaked)

        if (currentLevel + 1 <= capacity){
            currentLevel++;
            await client.hSet(key, {
                currentLevel: currentLevel,
                lastLeakTime: now
            })
            return next();
        }

        await client.hSet(key, {
            currentLevel: capacity,
            lastLeakTime: now
        })

        return res.status(429).json({
            message: "It's leaking bitch!"
        })
    } catch (error) {
        return next(error);
    }
}