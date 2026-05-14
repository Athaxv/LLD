-- CreateEnum
CREATE TYPE "LockerSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "LockerStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'NOT_IN_SERVICE');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('CREATED', 'DELIVERED', 'PICKED_UP');

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'CREATED',
    "size" "LockerSize" NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locker" (
    "id" TEXT NOT NULL,
    "status" "LockerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "size" "LockerSize" NOT NULL,
    "currentPkgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Locker_pkey" PRIMARY KEY ("id")
);
