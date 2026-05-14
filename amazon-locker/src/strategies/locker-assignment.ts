import type { Locker } from "../models/locker";
import type { Package } from "../models/package";

export interface LockerAssignmentStrategy {

    assignLocker(
        pkg: Package,
        lockers: Locker[]
    ): Locker | null;
}