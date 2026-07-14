-- Structured supplier master data
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "vatNumber" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'IT',
    "streetAddress" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "eprRegistrationNumber" TEXT,
    "reachDeclarationRef" TEXT,
    "foodContactRegistration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_shop_supplierCode_key" ON "Supplier"("shop", "supplierCode");
CREATE INDEX "Supplier_shop_status_idx" ON "Supplier"("shop", "status");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accredited laboratory registry
CREATE TABLE "TestingLaboratory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "laboratoryCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IT',
    "accreditationBody" TEXT NOT NULL,
    "accreditationNumber" TEXT NOT NULL,
    "accreditationScope" TEXT NOT NULL,
    "contactEmail" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestingLaboratory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestingLaboratory_shop_laboratoryCode_key" ON "TestingLaboratory"("shop", "laboratoryCode");
CREATE INDEX "TestingLaboratory_shop_status_idx" ON "TestingLaboratory"("shop", "status");
ALTER TABLE "TestingLaboratory" ADD CONSTRAINT "TestingLaboratory_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manufacturer and responsible signatory identity
CREATE TABLE "ManufacturerResponsible" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "manufacturerLegalName" TEXT NOT NULL,
    "vatNumber" TEXT,
    "eoriNumber" TEXT,
    "streetAddress" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IT',
    "responsibleName" TEXT NOT NULL,
    "responsibleRole" TEXT NOT NULL,
    "responsibleEmail" TEXT NOT NULL,
    "authorityBasis" TEXT NOT NULL,
    "identityVerificationMethod" TEXT NOT NULL DEFAULT 'SHOPIFY_ADMIN_ATTESTATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturerResponsible_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturerResponsible_shop_key" ON "ManufacturerResponsible"("shop");
ALTER TABLE "ManufacturerResponsible" ADD CONSTRAINT "ManufacturerResponsible_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link each physical component to its supplier master record.
ALTER TABLE "PackagingComponent" ADD COLUMN "supplierId" TEXT;
CREATE INDEX "PackagingComponent_supplierId_idx" ON "PackagingComponent"("supplierId");
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SupplierDeclaration" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "componentId" TEXT,
    "declarationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "sha256" TEXT,
    "notes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierDeclaration_profileId_reference_key" ON "SupplierDeclaration"("profileId", "reference");
CREATE INDEX "SupplierDeclaration_supplierId_idx" ON "SupplierDeclaration"("supplierId");
CREATE INDEX "SupplierDeclaration_profileId_status_idx" ON "SupplierDeclaration"("profileId", "status");
CREATE INDEX "SupplierDeclaration_componentId_idx" ON "SupplierDeclaration"("componentId");
ALTER TABLE "SupplierDeclaration" ADD CONSTRAINT "SupplierDeclaration_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierDeclaration" ADD CONSTRAINT "SupplierDeclaration_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierDeclaration" ADD CONSTRAINT "SupplierDeclaration_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PackagingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LaboratoryTest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "componentId" TEXT,
    "laboratoryId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "standardReference" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "sampleReference" TEXT NOT NULL,
    "batchNumber" TEXT,
    "resultStatus" TEXT NOT NULL,
    "resultSummary" TEXT NOT NULL,
    "measuredValues" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sourceUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaboratoryTest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LaboratoryTest_profileId_reportNumber_key" ON "LaboratoryTest"("profileId", "reportNumber");
CREATE INDEX "LaboratoryTest_profileId_verificationStatus_idx" ON "LaboratoryTest"("profileId", "verificationStatus");
CREATE INDEX "LaboratoryTest_componentId_idx" ON "LaboratoryTest"("componentId");
CREATE INDEX "LaboratoryTest_laboratoryId_idx" ON "LaboratoryTest"("laboratoryId");
ALTER TABLE "LaboratoryTest" ADD CONSTRAINT "LaboratoryTest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryTest" ADD CONSTRAINT "LaboratoryTest_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PackagingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryTest" ADD CONSTRAINT "LaboratoryTest_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "TestingLaboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Versioned snapshot of the merchant's CONAI classification decision.
CREATE TABLE "ConaiClassification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "materialFamily" TEXT NOT NULL,
    "conaiMaterialCode" TEXT NOT NULL,
    "contributionBand" TEXT,
    "environmentalClass" TEXT,
    "packagingType" TEXT NOT NULL,
    "contributionEurPerTonne" DOUBLE PRECISION,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "sourceReference" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "classificationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "classifiedBy" TEXT,
    "classifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConaiClassification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConaiClassification_componentId_key" ON "ConaiClassification"("componentId");
CREATE INDEX "ConaiClassification_shop_materialFamily_contributionBand_idx" ON "ConaiClassification"("shop", "materialFamily", "contributionBand");
CREATE INDEX "ConaiClassification_shop_classificationStatus_idx" ON "ConaiClassification"("shop", "classificationStatus");
ALTER TABLE "ConaiClassification" ADD CONSTRAINT "ConaiClassification_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConaiClassification" ADD CONSTRAINT "ConaiClassification_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PackagingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Immutable electronic attestation bound to a canonical dossier hash.
CREATE TABLE "DeclarationSignature" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "declarationNumber" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signatureMethod" TEXT NOT NULL DEFAULT 'ELECTRONIC_ATTESTATION',
    "typedSignature" TEXT NOT NULL,
    "attestationText" TEXT NOT NULL,
    "statementVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "actorSessionId" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeclarationSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeclarationSignature_profileId_key" ON "DeclarationSignature"("profileId");
CREATE INDEX "DeclarationSignature_responsibleId_signedAt_idx" ON "DeclarationSignature"("responsibleId", "signedAt");
CREATE INDEX "DeclarationSignature_declarationNumber_idx" ON "DeclarationSignature"("declarationNumber");
ALTER TABLE "DeclarationSignature" ADD CONSTRAINT "DeclarationSignature_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PackagingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeclarationSignature" ADD CONSTRAINT "DeclarationSignature_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ManufacturerResponsible"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
