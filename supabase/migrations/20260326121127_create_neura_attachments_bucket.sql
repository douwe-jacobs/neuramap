/*
  # Create neura-attachments storage bucket and policies

  ## Purpose
  Allows users to upload images and PDF files as attachments to neuron insights.

  ## Changes
  - Creates the `neura-attachments` bucket (public)
  - Adds INSERT policy for anonymous uploads
  - Adds SELECT policy for anonymous reads
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('neura-attachments', 'neura-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow anon uploads to neura-attachments"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'neura-attachments');

CREATE POLICY "Allow anon reads from neura-attachments"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'neura-attachments');

CREATE POLICY "Allow anon deletes from neura-attachments"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'neura-attachments');
