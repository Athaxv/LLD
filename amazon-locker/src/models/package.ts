import { LockerSize, PackageStatus } from "./enums";

export class Package {

    constructor(
        public id: string,
        public customerId: string,
        public status: PackageStatus = PackageStatus.CREATED,
        public size: LockerSize
    ) {}

    markDelivered() {
        this.status = PackageStatus.DELIVERED;
    }

    markPickedUp(){
        this.status = PackageStatus.PICKED_UP;
    }
}