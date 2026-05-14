export class PickupCode {

    constructor(
        public code: string,
        public expiresAt: Date 
    ){}

    isExpired(): boolean {
        return this.expiresAt <= new Date;
    }
}