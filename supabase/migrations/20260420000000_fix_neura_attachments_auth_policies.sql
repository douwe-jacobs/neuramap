/*
  # Fix neura-attachments storage policies for authenticated (anonymous) users

  ## Problem
  signInAnonymously() gives users the `authenticated` role, not `anon`.
  The existing policies only covered `anon`, so uploads were blocked by RLS.

  ## Changes
  - Adds INSERT, SELECT, DELETE policies for the `authenticated` role
*/

CREATE POLICY "Allow authenticated uploads to neura-attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'neura-attachments');

CREATE POLICY "Allow authenticated reads from neura-attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'neura-attachments');

CREATE POLICY "Allow authenticated deletes from neura-attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'neura-attachments');
