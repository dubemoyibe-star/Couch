-- CreateTable
CREATE TABLE "LicenseRecord" (
    "id" TEXT NOT NULL,
    "licenseName" TEXT NOT NULL,
    "licenseVersion" TEXT,
    "licenseUrl" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rightsholder" TEXT,
    "attributionRequired" BOOLEAN NOT NULL,
    "attribution" TEXT,
    "intendedUseAllowed" BOOLEAN NOT NULL,
    "commercialUseAllowed" BOOLEAN NOT NULL,
    "additionalRestrictions" TEXT,
    "verifiedAt" DATE NOT NULL,
    "verificationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerMediaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "posterUrl" TEXT,
    "releaseYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "licenseRecordId" TEXT NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_licenseRecordId_key" ON "Media"("licenseRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_providerId_providerMediaId_key" ON "Media"("providerId", "providerMediaId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_licenseRecordId_fkey" FOREIGN KEY ("licenseRecordId") REFERENCES "LicenseRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
