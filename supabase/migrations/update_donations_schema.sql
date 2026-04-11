-- Migration: update donations table to support split names, subscription tracking, and status
-- Run this in your Supabase SQL editor (Project → SQL Editor → New query)
-- Safe to run multiple times — uses IF NOT EXISTS / DO $$ guards throughout

-- 1. Add first_name column (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'donations' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE donations ADD COLUMN first_name text;
  END IF;
END $$;

-- 2. Add last_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'donations' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE donations ADD COLUMN last_name text;
  END IF;
END $$;

-- 3. Add subscription_id column (for recurring donors)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'donations' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE donations ADD COLUMN subscription_id text;
  END IF;
END $$;

-- 4. Add status column (succeeded / failed / cancelled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'donations' AND column_name = 'status'
  ) THEN
    ALTER TABLE donations ADD COLUMN status text DEFAULT 'succeeded';
  END IF;
END $$;

-- 5. Back-fill first_name / last_name from existing "name" column (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'donations' AND column_name = 'name'
  ) THEN
    UPDATE donations
    SET
      first_name = split_part(name, ' ', 1),
      last_name  = NULLIF(trim(substring(name from position(' ' in name) + 1)), '')
    WHERE name IS NOT NULL AND first_name IS NULL;
  END IF;
END $$;

-- 6. Set status = 'succeeded' on any existing rows that have null status
UPDATE donations SET status = 'succeeded' WHERE status IS NULL;

-- 7. Index on subscription_id for fast webhook lookups
CREATE INDEX IF NOT EXISTS donations_subscription_id_idx ON donations (subscription_id);

-- 8. Index on email for donor profile grouping
CREATE INDEX IF NOT EXISTS donations_email_idx ON donations (email);

-- ── FRESH TABLE DEFINITION (for new projects) ───────────────────────────────
-- If you're starting from scratch, run this instead of the migrations above:
--
-- CREATE TABLE IF NOT EXISTS donations (
--   id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
--   created_at        timestamptz DEFAULT now(),
--   first_name        text,
--   last_name         text,
--   email             text,
--   amount            numeric     NOT NULL,
--   recurring         boolean     DEFAULT false,
--   stripe_payment_id text        NOT NULL UNIQUE,
--   subscription_id   text,
--   status            text        DEFAULT 'succeeded'
-- );
-- CREATE INDEX IF NOT EXISTS donations_email_idx ON donations (email);
-- CREATE INDEX IF NOT EXISTS donations_subscription_id_idx ON donations (subscription_id);
