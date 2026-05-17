/*
  # Fix neura_storage for authenticated users + per-user data isolation

  ## Problem
  1. `neura_storage` only had RLS policies for the `anon` role. Since
     signInAnonymously() and Google OAuth both produce `authenticated` role
     users, all reads silently return zero rows — the app treats every
     signed-in user as new and shows an empty canvas.

  2. The `key` column was the sole primary key, so all users shared the
     same key-space. The upserts in storage.ts already reference
     `onConflict: 'user_id,key'` but that constraint never existed,
     causing every save to fail silently.

  ## Changes
  1. Add `user_id uuid NOT NULL DEFAULT auth.uid()` — Supabase auto-populates
     this from the JWT on every INSERT, so no application code changes needed.
  2. Backfill existing rows to the owner's user ID so no data is lost.
  3. Remove the old single-column primary key on `key`.
  4. Add composite primary key on `(user_id, key)` — this is the constraint
     that `onConflict: 'user_id,key'` in storage.ts resolves against.
  5. Add an `authenticated` ALL policy scoped to the user's own rows.

  ## Notes
  - The existing `anon` policies are left in place; they are now effectively
    dead (the app always authenticates before querying) but harmless.
  - `auth.uid()` is a Supabase built-in that reads the `sub` claim from the
    current request JWT, so the default is evaluated per-row at insert time.
*/

-- 1. Add user_id as nullable first so existing rows are not immediately rejected
ALTER TABLE neura_storage
  ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- 2. Backfill all existing rows to the owner's user ID (no data lost)
UPDATE neura_storage
  SET user_id = 'a4f9a7ea-40eb-4545-88dc-c6d865b1e434'
  WHERE user_id IS NULL;

-- 3. Enforce NOT NULL now that every row has a user_id
ALTER TABLE neura_storage ALTER COLUMN user_id SET NOT NULL;

-- 4. Set the column default so future INSERTs are auto-populated from the JWT
ALTER TABLE neura_storage ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 5. Swap primary key: drop the key-only PK, add composite (user_id, key)
ALTER TABLE neura_storage DROP CONSTRAINT neura_storage_pkey;
ALTER TABLE neura_storage ADD PRIMARY KEY (user_id, key);

-- 6. Allow authenticated users full access to their own rows only
CREATE POLICY "authenticated users manage own rows"
  ON neura_storage FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
