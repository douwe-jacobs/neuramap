/*
  # Storage policies for neura-audio bucket

  Allow anonymous users to upload and read audio files
  used for voice transcription.
*/

CREATE POLICY "Allow anon uploads to neura-audio"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'neura-audio');

CREATE POLICY "Allow anon reads from neura-audio"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'neura-audio');
