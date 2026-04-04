/*
  # Create neura_storage key-value table

  A simple key-value store for persisting NeuraMap world data.

  1. New Tables
    - `neura_storage`
      - `key` (text, primary key) - storage key
      - `value` (text) - JSON-serialized value
      - `updated_at` (timestamptz) - last update time

  2. Security
    - Enable RLS
    - Allow anon read and write (app uses anon key, no auth required for this prototype)
*/

CREATE TABLE IF NOT EXISTS neura_storage (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE neura_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read"
  ON neura_storage FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert"
  ON neura_storage FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update"
  ON neura_storage FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
