-- Remove parent links that were previously allowed to cross household boundaries.
-- Self-links are also invalid and are safely detached before the new constraint.
UPDATE "HouseholdCategory" child
SET "parentCategoryId" = NULL
WHERE child."parentCategoryId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "HouseholdCategory" parent
    WHERE parent."id" = child."parentCategoryId"
      AND parent."householdId" = child."householdId"
      AND parent."id" <> child."id"
  );

DO $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE category_chain AS (
      SELECT category."id", category."householdId", category."parentCategoryId", ARRAY[category."id"]::TEXT[] AS path, false AS has_cycle
      FROM "HouseholdCategory" category
      WHERE category."parentCategoryId" IS NOT NULL
      UNION ALL
      SELECT parent."id", parent."householdId", parent."parentCategoryId", chain.path || parent."id", parent."id" = ANY(chain.path)
      FROM "HouseholdCategory" parent
      JOIN category_chain chain ON parent."id" = chain."parentCategoryId"
      WHERE NOT chain.has_cycle
    )
    SELECT 1 FROM category_chain WHERE has_cycle
  ) THEN
    RAISE EXCEPTION 'Cannot add household-scoped category hierarchy constraint: cyclic category hierarchy exists';
  END IF;
END $$;

ALTER TABLE "HouseholdCategory" DROP CONSTRAINT IF EXISTS "HouseholdCategory_parentCategoryId_fkey";
DROP INDEX IF EXISTS "HouseholdCategory_parentCategoryId_idx";
CREATE INDEX "HouseholdCategory_householdId_parentCategoryId_idx" ON "HouseholdCategory"("householdId", "parentCategoryId");
ALTER TABLE "HouseholdCategory" ADD CONSTRAINT "HouseholdCategory_householdId_parentCategoryId_fkey"
  FOREIGN KEY ("householdId", "parentCategoryId") REFERENCES "HouseholdCategory"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
