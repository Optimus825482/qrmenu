-- Table QR tokens are generated in P5; until then a table has none (rooms.qr_token is nullable too).
ALTER TABLE "outlet_tables" ALTER COLUMN "qr_token" DROP NOT NULL;
