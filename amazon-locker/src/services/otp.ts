import { randomInt } from "node:crypto";

export class OTPService {

    generateOTP(): string {
        return randomInt(100000, 1000000).toString();
    }
}