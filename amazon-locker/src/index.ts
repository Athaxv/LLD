import { LockerSize, LockerStatus, PackageStatus } from "./models/enums";
import { Locker } from "./models/locker";
import { Package } from "./models/package";
import { LockerRepository } from "./repositories/locker";
import { LockerService } from "./services/locker";
import { OTPService } from "./services/otp";
import { SmallestFitStrategy } from "./strategies/smallest-fit-strategy";

const lockerRepo = new LockerRepository()

lockerRepo.addLocker(
    new Locker("L1", LockerSize.SMALL)
)

lockerRepo.addLocker(
    new Locker("L2", LockerSize.MEDIUM)
)

lockerRepo.addLocker(
    new Locker("L3", LockerSize.LARGE)
)

const lockerService = new LockerService(
    lockerRepo,
    new SmallestFitStrategy(),
    new OTPService()
);

const pkg = new Package(
    "PKG1",
    "USER1",
    PackageStatus.CREATED,
    LockerSize.SMALL
)

const locker = lockerService.allocateLocker(pkg)

console.log(`Package allocated to locker ${locker.id}`)