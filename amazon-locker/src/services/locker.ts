import { Locker } from "../models/locker";
import { PickupCode } from "../models/otp";
import type { Package } from "../models/package";
import type { LockerRepository } from "../repositories/locker";
import type { LockerAssignmentStrategy } from "../strategies/locker-assignment";
import type { OTPService } from "./otp";

export class LockerService {

    private pickupCodes = new Map<string, PickupCode>();

    constructor(
        private lockerRepo: LockerRepository,
        private assignmentStrategy: LockerAssignmentStrategy,
        private otpService :OTPService 
    ){}

    allocateLocker(pkg: Package): Locker {
        const lockers = this.lockerRepo.getAll();

        const locker = this.assignmentStrategy.assignLocker(pkg, lockers);

        if (!locker) {
            throw new Error("No locker available")
        }

        const assigned = locker.assignPackage(pkg)

        if (!assigned) {
            throw new Error("Locked allocation failed!")
        }

        pkg.markDelivered();

        const otp = this.otpService.generateOTP();

        this.pickupCodes.set(pkg.id, new PickupCode(
            otp,
            new Date(Date.now() + 24 * 60 * 60 * 1000)
        ))

        console.log(`OTP for package ${pkg.id}: ${otp}`)

        return locker;
    }

    pickupPackage(lockerId: string, otp: string): Package {
        const locker = this.lockerRepo.findById(lockerId)

        if (!locker) {
            throw new Error("Locker not found")
        }

        const pkg = locker.currentPackage;

        if (!pkg) {
            throw new Error("No package");
        }

        const storedOTP = this.pickupCodes.get(pkg.id)

        if (!storedOTP){
            throw new Error("OTP missing!")
        }

        if (storedOTP.isExpired()){
            throw new Error("OTP expired")
        }

        if (storedOTP.code !== otp){
            throw new Error("Invalid OTP")
        }

        locker.releasePackage()

        pkg.markPickedUp()

        this.pickupCodes.delete(pkg.id)

        return pkg;
    }
}