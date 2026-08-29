-- Add tenant-aware parent keys before replacing goal-related foreign keys.
CREATE UNIQUE INDEX "HouseholdAccount_householdId_id_key" ON "HouseholdAccount"("householdId", "id");
CREATE UNIQUE INDEX "HouseholdTransaction_householdId_id_key" ON "HouseholdTransaction"("householdId", "id");
CREATE UNIQUE INDEX "Goal_householdId_id_key" ON "Goal"("householdId", "id");
CREATE UNIQUE INDEX "GoalMovement_householdId_id_key" ON "GoalMovement"("householdId", "id");
CREATE UNIQUE INDEX "GoalAutomationRule_householdId_id_key" ON "GoalAutomationRule"("householdId", "id");

-- Replace independent-ID relations with composite tenant-aware relations.
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_accountId_fkey";
ALTER TABLE "GoalMovement" DROP CONSTRAINT "GoalMovement_goalId_fkey";
ALTER TABLE "GoalMovement" DROP CONSTRAINT "GoalMovement_automationRuleId_fkey";
ALTER TABLE "GoalAutomationRule" DROP CONSTRAINT "GoalAutomationRule_goalId_fkey";
ALTER TABLE "GoalAutomationRule" DROP CONSTRAINT "GoalAutomationRule_fundingAccountId_fkey";
ALTER TABLE "GoalAutomationRule" DROP CONSTRAINT "GoalAutomationRule_triggerAccountId_fkey";
ALTER TABLE "HouseholdTransaction" DROP CONSTRAINT "HouseholdTransaction_goalMovementId_fkey";

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_householdId_accountId_fkey"
  FOREIGN KEY ("householdId", "accountId") REFERENCES "HouseholdAccount"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalMovement"
  ADD CONSTRAINT "GoalMovement_householdId_goalId_fkey"
  FOREIGN KEY ("householdId", "goalId") REFERENCES "Goal"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalAutomationRule"
  ADD CONSTRAINT "GoalAutomationRule_householdId_goalId_fkey"
  FOREIGN KEY ("householdId", "goalId") REFERENCES "Goal"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GoalAutomationRule_householdId_fundingAccountId_fkey"
  FOREIGN KEY ("householdId", "fundingAccountId") REFERENCES "HouseholdAccount"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoalAutomationRule_householdId_triggerAccountId_fkey"
  FOREIGN KEY ("householdId", "triggerAccountId") REFERENCES "HouseholdAccount"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalMovement"
  ADD CONSTRAINT "GoalMovement_householdId_automationRuleId_fkey"
  FOREIGN KEY ("householdId", "automationRuleId") REFERENCES "GoalAutomationRule"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HouseholdTransaction"
  ADD CONSTRAINT "HouseholdTransaction_householdId_goalMovementId_fkey"
  FOREIGN KEY ("householdId", "goalMovementId") REFERENCES "GoalMovement"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalMovement"
  ADD CONSTRAINT "GoalMovement_householdId_sourceTransactionId_fkey"
  FOREIGN KEY ("householdId", "sourceTransactionId") REFERENCES "HouseholdTransaction"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent concurrent creation of the same active automation configuration.
CREATE UNIQUE INDEX "GoalAutomationRule_active_configuration_key"
  ON "GoalAutomationRule"(
    "householdId",
    "goalId",
    "ruleType",
    "fundingAccountId",
    COALESCE("triggerAccountId", ''),
    "startsOn",
    COALESCE("fixedAmount", -1),
    COALESCE("dayOfMonth", -1),
    COALESCE("percentage", -1),
    COALESCE("incomeThreshold", -1),
    COALESCE("roundUpToAmount", -1)
  )
  WHERE "isActive" = true;
