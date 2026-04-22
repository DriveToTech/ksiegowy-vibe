-- Rename PaymentMethod enum values from Polish to English
ALTER TYPE "PaymentMethod" RENAME VALUE 'PRZELEW' TO 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" RENAME VALUE 'GOTOWKA' TO 'CASH';
ALTER TYPE "PaymentMethod" RENAME VALUE 'KARTA' TO 'CARD';
ALTER TYPE "PaymentMethod" RENAME VALUE 'INNA' TO 'OTHER';
