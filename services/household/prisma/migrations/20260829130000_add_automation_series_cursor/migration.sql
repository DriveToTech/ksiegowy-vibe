-- Keep an immutable automation series identity when mutable account fields change.
ALTER TABLE "GoalAutomationRule"
  ADD COLUMN "automationIdentity" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "roundUpCursorDate" DATE,
  ADD COLUMN "roundUpCursorId" TEXT;

-- Existing rules are valid series; assign each one a stable identity before making the column required.
UPDATE "GoalAutomationRule"
SET "automationIdentity" = 'legacy-' || md5("id" || ':' || random()::text)
WHERE "automationIdentity" IS NULL;

ALTER TABLE "GoalAutomationRule"
  ALTER COLUMN "automationIdentity" SET NOT NULL;

CREATE UNIQUE INDEX "GoalAutomationRule_householdId_automationIdentity_key"
  ON "GoalAutomationRule"("householdId", "automationIdentity");
CREATE INDEX "GoalAutomationRule_householdId_deletedAt_idx"
  ON "GoalAutomationRule"("householdId", "deletedAt");
CREATE INDEX "GoalAutomationRule_roundUpCursor_idx"
  ON "GoalAutomationRule"("roundUpCursorDate", "roundUpCursorId");
