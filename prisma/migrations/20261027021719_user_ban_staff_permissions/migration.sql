-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'BANNED';

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
