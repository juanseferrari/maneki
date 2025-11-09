-- Fix Supabase Storage policies to allow public access
-- Run this in your Supabase SQL Editor

-- This allows the bucket to be accessed without Supabase Auth
-- Since we're using our own Google OAuth authentication

-- First, let's check if the bucket exists and its current policies
SELECT * FROM storage.buckets WHERE name = 'uploads';

-- Update the bucket to be public (if it exists)
UPDATE storage.buckets
SET public = true
WHERE name = 'uploads';

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- Create policies to allow public access to the uploads bucket
-- Since we're managing authentication separately with Google OAuth

-- Allow anyone to upload files to the uploads bucket
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'uploads');

-- Allow anyone to view files in the uploads bucket
CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'uploads');

-- Allow anyone to update files in the uploads bucket
CREATE POLICY "Allow public updates"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');

-- Allow anyone to delete files in the uploads bucket
CREATE POLICY "Allow public deletes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'uploads');

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';

-- Verify bucket is now public
SELECT name, public FROM storage.buckets WHERE name = 'uploads';
