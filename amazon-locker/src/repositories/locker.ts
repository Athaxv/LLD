import { Locker } from "../models/locker";

export class LockerRepository {

    private lockers: Locker[] = []

    addLocker(locker: Locker){
        this.lockers.push(locker)
    }

    getAll(): Locker[]{
        return this.lockers
    }

    findById(id: string): Locker | undefined{
        return this.lockers.find((lck) => lck.id === id)
    }
}