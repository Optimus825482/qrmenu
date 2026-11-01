ALTER TABLE "users"
  ADD COLUMN "job_title" TEXT,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
