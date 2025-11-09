-- Supabase Storage RLS Policies Setup
-- Run this SQL script in your Supabase SQL Editor to enable file uploads

-- First, ensure RLS is enabled on the storage.objects table
-- This should already be enabled by default

-- Drop existing policies if they exist (optional - uncomment if recreating)
-- DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;

-- Policy 1: Allow anyone to upload files to the 'uploads' bucket
CREATE POLICY "Allow public uploads"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'uploads');

-- Policy 2: Allow anyone to read/view files from the 'uploads' bucket
CREATE POLICY "Allow public reads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'uploads');

-- Policy 3: Allow anyone to delete files from the 'uploads' bucket
CREATE POLICY "Allow public deletes"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'uploads');

-- Policy 4: Allow anyone to update files in the 'uploads' bucket
CREATE POLICY "Allow public updates"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');

-- Verify the policies were created
SELECT * FROM pg_policies WHERE tablename = 'objects';
