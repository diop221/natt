-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "contactsAt" TIMESTAMP(3),
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "halves" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "heirName" TEXT,
ADD COLUMN     "heirPhone" TEXT,
ADD COLUMN     "heirRelation" TEXT,
ADD COLUMN     "reserveXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "transferredAt" TIMESTAMP(3),
ADD COLUMN     "voiceNotes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "handId" TEXT;

-- AlterTable
ALTER TABLE "Tontine" ADD COLUMN     "reserveBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TurnSwap" ADD COLUMN     "partnerHandId" TEXT,
ADD COLUMN     "requesterHandId" TEXT;

-- CreateTable
CREATE TABLE "Hand" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Hand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandHolder" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "halves" INTEGER NOT NULL,

    CONSTRAINT "HandHolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveEntry" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "evidence" TEXT,
    "evidenceAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- Reprise des données : dans les tontines classiques existantes, chaque membre tient une main entière
-- à sa position actuelle. La main reprend l'identifiant du membre : la preuve d'un tirage déjà fait
-- (sha256(hash du bloc + ":" + identifiant)) reste donc identique.
INSERT INTO "Hand" ("id", "tontineId", "position")
SELECT m."id", m."tontineId", m."position"
FROM "Member" m JOIN "Tontine" t ON t."id" = m."tontineId"
WHERE t."type" = 'ROTATING';

INSERT INTO "HandHolder" ("id", "handId", "memberId", "halves")
SELECT m."id", m."id", m."id", 2
FROM "Member" m JOIN "Tontine" t ON t."id" = m."tontineId"
WHERE t."type" = 'ROTATING';

UPDATE "Round" r SET "handId" = r."beneficiaryId"
FROM "Tontine" t
WHERE t."id" = r."tontineId" AND t."type" = 'ROTATING' AND r."beneficiaryId" IS NOT NULL;

UPDATE "TurnSwap" SET "requesterHandId" = "requesterId", "partnerHandId" = "partnerId";
ALTER TABLE "TurnSwap" ALTER COLUMN "requesterHandId" SET NOT NULL, ALTER COLUMN "partnerHandId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Hand_tontineId_position_key" ON "Hand"("tontineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HandHolder_handId_memberId_key" ON "HandHolder"("handId", "memberId");

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnSwap" ADD CONSTRAINT "TurnSwap_requesterHandId_fkey" FOREIGN KEY ("requesterHandId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnSwap" ADD CONSTRAINT "TurnSwap_partnerHandId_fkey" FOREIGN KEY ("partnerHandId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hand" ADD CONSTRAINT "Hand_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandHolder" ADD CONSTRAINT "HandHolder_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandHolder" ADD CONSTRAINT "HandHolder_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveEntry" ADD CONSTRAINT "ReserveEntry_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveEntry" ADD CONSTRAINT "ReserveEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
