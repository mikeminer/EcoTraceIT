ALTER TABLE "SustainabilityOrder" ADD COLUMN "packagingProfileId" TEXT;

CREATE TABLE "ComplianceOperator" (
  "shop" TEXT NOT NULL,
  "economicRole" TEXT NOT NULL DEFAULT 'DISTRIBUTOR',
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT,
  "vatNumber" TEXT,
  "streetAddress" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'IT',
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "authorisedRepresentative" TEXT,
  "eprRegistrationNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceOperator_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "PackagingProfile" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "uniqueIdentifier" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "intendedUse" TEXT NOT NULL,
  "packagingLevel" TEXT NOT NULL DEFAULT 'ECOMMERCE',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isReusable" BOOLEAN NOT NULL DEFAULT false,
  "reuseCycles" INTEGER,
  "foodContact" BOOLEAN NOT NULL DEFAULT false,
  "packagingWeightGrams" DOUBLE PRECISION NOT NULL,
  "lengthMm" DOUBLE PRECISION NOT NULL,
  "widthMm" DOUBLE PRECISION NOT NULL,
  "heightMm" DOUBLE PRECISION NOT NULL,
  "productVolumeCm3" DOUBLE PRECISION NOT NULL,
  "emptySpaceRatio" DOUBLE PRECISION NOT NULL,
  "substancesStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "recyclabilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "recyclabilityGrade" TEXT,
  "recycledContentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "compostabilityStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  "labelStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "minimisationAssessment" TEXT NOT NULL,
  "riskAssessment" TEXT NOT NULL,
  "manufacturingControls" TEXT NOT NULL,
  "harmonisedStandards" TEXT,
  "commonSpecifications" TEXT,
  "otherTechnicalSpecifications" TEXT,
  "applicableLegislation" TEXT,
  "declarationNumber" TEXT,
  "declarationPlace" TEXT,
  "signatoryName" TEXT,
  "signatoryRole" TEXT,
  "declaredAt" TIMESTAMP(3),
  "retentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PackagingProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackagingComponent" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "materialCode" TEXT NOT NULL,
  "materialName" TEXT NOT NULL, "function" TEXT NOT NULL, "weightGrams" DOUBLE PRECISION NOT NULL,
  "recycledContentPercent" DOUBLE PRECISION NOT NULL DEFAULT 0, "postConsumerPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recyclingStream" TEXT NOT NULL, "separable" BOOLEAN NOT NULL DEFAULT true, "supplierName" TEXT,
  "supplierDeclarationRef" TEXT, "substancesOfConcern" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PackagingComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceEvidence" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "evidenceType" TEXT NOT NULL, "title" TEXT NOT NULL,
  "reference" TEXT NOT NULL, "issuer" TEXT, "issuedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
  "sourceUrl" TEXT, "sha256" TEXT, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ComplianceEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceCheck" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "code" TEXT NOT NULL, "article" TEXT NOT NULL,
  "status" TEXT NOT NULL, "message" TEXT NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceAuditLog" (
  "id" TEXT NOT NULL, "shop" TEXT NOT NULL, "profileId" TEXT, "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackagingProfile_shop_uniqueIdentifier_version_key" ON "PackagingProfile"("shop", "uniqueIdentifier", "version");
CREATE INDEX "PackagingProfile_shop_status_idx" ON "PackagingProfile"("shop", "status");
CREATE INDEX "PackagingComponent_profileId_idx" ON "PackagingComponent"("profileId");
CREATE INDEX "ComplianceEvidence_profileId_evidenceType_idx" ON "ComplianceEvidence"("profileId", "evidenceType");
CREATE UNIQUE INDEX "ComplianceCheck_profileId_code_key" ON "ComplianceCheck"("profileId", "code");
CREATE INDEX "ComplianceCheck_profileId_status_idx" ON "ComplianceCheck"("profileId", "status");
CREATE INDEX "ComplianceAuditLog_shop_createdAt_idx" ON "ComplianceAuditLog"("shop", "createdAt");
CREATE INDEX "ComplianceAuditLog_profileId_createdAt_idx" ON "ComplianceAuditLog"("profileId", "createdAt");
CREATE INDEX "SustainabilityOrder_packagingProfileId_idx" ON "SustainabilityOrder"("packagingProfileId");

ALTER TABLE "ComplianceOperator" ADD CONSTRAINT "ComplianceOperator_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingProfile" ADD CONSTRAINT "PackagingProfile_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceAuditLog" ADD CONSTRAINT "ComplianceAuditLog_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceAuditLog" ADD CONSTRAINT "ComplianceAuditLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SustainabilityOrder" ADD CONSTRAINT "SustainabilityOrder_packagingProfileId_fkey" FOREIGN KEY ("packagingProfileId") REFERENCES "PackagingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ReusablePackagingUnit" (
  "id" TEXT NOT NULL, "shop" TEXT NOT NULL, "profileId" TEXT NOT NULL, "serialNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "cycleCount" INTEGER NOT NULL DEFAULT 0, "maxCycles" INTEGER NOT NULL,
  "lastOrderGid" TEXT, "lastCarrier" TEXT, "lastTrackingNumber" TEXT, "lastShippedAt" TIMESTAMP(3),
  "lastReturnedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ReusablePackagingUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReuseEvent" (
  "id" TEXT NOT NULL, "unitId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "orderGid" TEXT,
  "carrier" TEXT, "trackingNumber" TEXT, "condition" TEXT, "notes" TEXT, "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ReuseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReusablePackagingUnit_shop_serialNumber_key" ON "ReusablePackagingUnit"("shop", "serialNumber");
CREATE INDEX "ReusablePackagingUnit_shop_status_idx" ON "ReusablePackagingUnit"("shop", "status");
CREATE INDEX "ReusablePackagingUnit_profileId_idx" ON "ReusablePackagingUnit"("profileId");
CREATE INDEX "ReuseEvent_unitId_occurredAt_idx" ON "ReuseEvent"("unitId", "occurredAt");
CREATE INDEX "ReuseEvent_trackingNumber_idx" ON "ReuseEvent"("trackingNumber");
ALTER TABLE "ReusablePackagingUnit" ADD CONSTRAINT "ReusablePackagingUnit_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReusablePackagingUnit" ADD CONSTRAINT "ReusablePackagingUnit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReuseEvent" ADD CONSTRAINT "ReuseEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ReusablePackagingUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackagingComponent" ADD COLUMN "conaiMaterial" TEXT,
ADD COLUMN "conaiContributionBand" TEXT,
ADD COLUMN "packagingType" TEXT DEFAULT 'SECONDARY_TERTIARY';