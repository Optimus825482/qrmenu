import { config } from "dotenv";
import path from "node:path";

// DATABASE_URL_TEST and the other test variables live in merit/.env.
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });
// Background jobs (pg-boss) never start in tests.
process.env.MERIT_DISABLE_JOBS = "1";
