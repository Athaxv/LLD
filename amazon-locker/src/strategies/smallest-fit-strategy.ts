import { LockerStatus } from "../models/enums";
import type { Locker } from "../models/locker";
import type { Package } from "../models/package";
import type { LockerAssignmentStrategy } from "./locker-assignment";

export class SmallestFitStrategy implements LockerAssignmentStrategy {

    assignLocker(pkg: Package, lockers: Locker[]): Locker | null {
        
        const validLockers = lockers.filter(
            locker => locker.status == LockerStatus.AVAILABLE && locker.canFit(pkg)
        )

        validLockers.sort((a, b) => {
            const order = {
                SMALL: 1,
                MEDIUM: 2,
                LARGE: 3
            }
            return order[a.size] - order[b.size];
        })

        return validLockers[0] || null;
    }
}