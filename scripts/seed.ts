/**
 * Seed script — bootstraps development / test database.
 *
 * Creates:
 *   - Acme Software sp. z o.o. (Company #1, NIP 1234563218, ksefEnv=TEST)
 *   - Example Client sp. z o.o. (Contractor #1, NIP 9876543210)
 *   - Admin user linked to your Google account (pass --email to override)
 *
 * Usage:
 *   pnpm tsx scripts/seed.ts
 *   pnpm tsx scripts/seed.ts --email your@email.com
 *   pnpm tsx scripts/seed.ts --reset   # drops and recreates all seed data
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const emailFlag = args.indexOf("--email");
const adminEmail =
  emailFlag !== -1 && args[emailFlag + 1]
    ? args[emailFlag + 1]!
    : "admin@example.com";

const TRYSOFT = {
  name: "Acme Software sp. z o.o.",
  nip: "1234563218",
  addressLine1: "ul. Testowa 1",
  addressLine2: "00-001 Warszawa",
  email: "contact@trysoft.pl",
  bankName: "PKO Bank Polski",
  bankAccount: "00000000000000000000000000", // replace with real account
  vatStatus: "ACTIVE" as const,
  ksefEnv: "TEST" as const,
};

const CONTRACTOR = {
  name: "Example Client sp. z o.o.",
  nip: "9876543210",
  addressLine1: "ul. Przykładowa 2",
  addressLine2: "00-002 Warszawa",
  countryCode: "PL",
};

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── 1. Trysoft company ─────────────────────────────────────────────────────
  let company = await prisma.company.findUnique({
    where: { nip: TRYSOFT.nip },
  });

  if (company && reset) {
    console.log(
      "⚠️  --reset: deleting existing Trysoft company and all related data",
    );
    await prisma.company.delete({ where: { nip: TRYSOFT.nip } });
    company = null;
  }

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: TRYSOFT.name,
        nip: TRYSOFT.nip,
        addressLine1: TRYSOFT.addressLine1,
        addressLine2: TRYSOFT.addressLine2,
        email: TRYSOFT.email,
        bankName: TRYSOFT.bankName,
        bankAccount: TRYSOFT.bankAccount,
        vatStatus: TRYSOFT.vatStatus,
        ksefEnv: TRYSOFT.ksefEnv,
        invoiceSeq: {},
      },
    });
    console.log(
      `✅ Company created: ${company.name} (NIP: ${company.nip}) id=${company.id}`,
    );
  } else {
    console.log(`ℹ️  Company already exists: ${company.name} id=${company.id}`);
  }

  // ── 2. CONTRACTOR contractor ───────────────────────────────────────────────
  const existingContractor = await prisma.contractor.findUnique({
    where: { companyId_nip: { companyId: company.id, nip: CONTRACTOR.nip } },
  });

  if (!existingContractor) {
    const contractor = await prisma.contractor.create({
      data: {
        companyId: company.id,
        name: CONTRACTOR.name,
        nip: CONTRACTOR.nip,
        addressLine1: CONTRACTOR.addressLine1,
        addressLine2: CONTRACTOR.addressLine2,
        countryCode: CONTRACTOR.countryCode,
        isActive: true,
      },
    });
    console.log(
      `✅ Contractor created: ${contractor.name} (NIP: ${contractor.nip}) id=${contractor.id}`,
    );
  } else {
    console.log(
      `ℹ️  Contractor already exists: ${existingContractor.name} id=${existingContractor.id}`,
    );
  }

  // ── 3. Admin user ───────────────────────────────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Jan Kowalski",
      },
    });
    console.log(`✅ User created: ${user.email} id=${user.id}`);
  } else {
    console.log(`ℹ️  User already exists: ${user.email} id=${user.id}`);
  }

  // ── 4. Company membership (admin role) ─────────────────────────────────────
  const existingMembership = await prisma.companyMembership.findUnique({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
  });

  if (!existingMembership) {
    await prisma.companyMembership.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "ADMIN",
      },
    });
    console.log(`✅ Membership: ${user.email} → ${company.name} (ADMIN)`);
  } else {
    console.log(
      `ℹ️  Membership already exists: ${user.email} → ${company.name} (${existingMembership.role})`,
    );
  }

  console.log("\n✅ Seed complete.");
  console.log(`\n   Company ID : ${company.id}`);
  console.log(`   User ID    : ${user.id}`);
  console.log(
    "\n   ⚠️  Remember to set a real bank account number in the DB before issuing invoices.",
  );
  console.log(
    "   ⚠️  Update company.bankAccount in Prisma Studio or via the settings UI.\n",
  );
}

seed()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
