-- CreateEnum
CREATE TYPE "CouchRole" AS ENUM ('HOST', 'PARTICIPANT');

-- CreateTable
CREATE TABLE "Couch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "currentMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Couch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouchMember" (
    "id" TEXT NOT NULL,
    "couchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CouchRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouchMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Couch_inviteCode_key" ON "Couch"("inviteCode");

-- CreateIndex
CREATE INDEX "CouchMember_couchId_idx" ON "CouchMember"("couchId");

-- CreateIndex
CREATE INDEX "CouchMember_userId_idx" ON "CouchMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouchMember_couchId_userId_key" ON "CouchMember"("couchId", "userId");

-- AddForeignKey
ALTER TABLE "Couch" ADD CONSTRAINT "Couch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Couch" ADD CONSTRAINT "Couch_currentMediaId_fkey" FOREIGN KEY ("currentMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouchMember" ADD CONSTRAINT "CouchMember_couchId_fkey" FOREIGN KEY ("couchId") REFERENCES "Couch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouchMember" ADD CONSTRAINT "CouchMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
