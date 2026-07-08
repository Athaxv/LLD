import express from "express";
import { rateLimiter } from "./ratelimiter/fixedWindow";

const app = express()
app.use(rateLimiter)

const PORT = 3000

var count = 0;

app.get("/", (req, res) => {
    count++;
    res.json({
        "hola": count
    })
})

app.listen(PORT, () => {
    console.log(`App running on ${PORT}`)
})