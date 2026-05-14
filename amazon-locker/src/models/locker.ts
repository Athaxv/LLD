import { LockerSize, LockerStatus } from "./enums"
import type { Package } from "./package"

export class Locker{

    public status: LockerStatus = LockerStatus.AVAILABLE
    public currentPackage: Package | null = null;

    constructor(
        public id: String,
        public size: LockerSize
    ){}

    canFit(pkg: Package): boolean {

        const order = {
            SMALL: 1,
            MEDIUM: 2,
            LARGE: 3
        }

        return order[this.size] >= order[pkg.size];
    }

    assignPackage(pkg: Package): boolean {

        if (this.status !== LockerStatus.AVAILABLE){
            return false;
        }

        this.currentPackage = pkg
        this.status = LockerStatus.OCCUPIED

        return true;
    }

    releasePackage(): Package | null {

        const pkg = this.currentPackage

        this.currentPackage = null
        this.status = LockerStatus.AVAILABLE

        return pkg;
    }
}