# Supabase Auth Setup Guide

This guide explains how to configure and use the Supabase Auth version of Maneki.

## What Changed?

We've created a new version of the app that uses **Supabase Authentication** instead of Passport.js:

### New Files:
- `server-supabase.js` - New server using Supabase Auth
- `views/index-supabase.ejs` - Frontend with Supabase Auth
- `public/js/upload-supabase.js` - Client-side logic for Supabase Auth
- `supabase-auth-rls-policies.sql` - RLS policies for Supabase Auth

### Old Files (Kept as backup):
- `server.js` - Original Passport.js version
- `views/index.ejs` - Original frontend
- `public/js/upload.js` - Original client-side logic

## Setup Steps

### 1. Configure Google OAuth in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Enable **Google** provider
5. Enter your Google Client ID and Client Secret
6. The redirect URL is automatically configured by Supabase:
   ```
   https://adgxouvmnkhcqfyyfrfo.supabase.co/auth/v1/callback
   ```

### 2. Configure Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Select your project (or create a new one)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. **Authorized redirect URIs** - Add BOTH:
   ```
   https://adgxouvmnkhcqfyyfrfo.supabase.co/auth/v1/callback
   https://maneki-36d85d517656.herokuapp.com
   ```
7. Copy the **Client ID** and **Client Secret**
8. Paste them into Supabase Auth → Providers → Google

### 3. Update RLS Policies in Supabase

Run the SQL script `supabase-auth-rls-policies.sql` in your Supabase SQL Editor:

```sql
-- This updates all RLS policies to use auth.uid() instead of custom user management
-- Run this entire file in Supabase SQL Editor
```

### 4. Configure Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Create a bucket named `uploads` (if it doesn't exist)
3. Make sure it's **public** or the RLS policies from step 3 are applied

### 5. Deploy to Heroku

The app is already configured to use `server-supabase.js` via the Procfile.

```bash
git add .
git commit -m "Add Supabase Auth implementation"
git push heroku main
```

### 6. Environment Variables

Make sure these are set in Heroku:

```bash
heroku config:set SUPABASE_URL="https://adgxouvmnkhcqfyyfrfo.supabase.co"
heroku config:set SUPABASE_ANON_KEY="your_anon_key"
heroku config:set SUPABASE_BUCKET_NAME="uploads"
heroku config:set MAX_FILE_SIZE_MB="10"
heroku config:set ANTHROPIC_API_KEY="your_api_key"
```

**Note:** You don't need these anymore (they were for Passport.js):
- `DATABASE_URL`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BASE_URL`

## How It Works

### Authentication Flow

1. User clicks "Continuar con Google"
2. Supabase redirects to Google OAuth
3. User authorizes the app
4. Google redirects back to Supabase: `https://adgxouvmnkhcqfyyfrfo.supabase.co/auth/v1/callback`
5. Supabase processes the OAuth response and redirects to your app: `https://maneki-36d85d517656.herokuapp.com`
6. The frontend detects the session and shows the app
7. All API calls include the JWT token in the `Authorization` header

### Data Access

- All database queries automatically filter by `user_id = auth.uid()`
- Storage files are organized by user ID
- RLS policies enforce data isolation between users

## Testing

1. Visit: https://maneki-36d85d517656.herokuapp.com
2. Click "Continuar con Google"
3. Authorize with your Google account
4. You should be redirected back and see the dashboard
5. Try uploading a file

## Troubleshooting

### "User not authenticated" errors
- Check that the session is active: Open browser console → Application → Cookies
- Look for `sb-<project-ref>-auth-token`

### "Invalid token" errors
- The JWT token might be expired
- Refresh the page to get a new session

### Files not uploading
- Check Storage bucket policies in Supabase
- Verify RLS policies are applied correctly
- Check browser console for errors

### Can't login with Google
- Verify redirect URLs in Google Cloud Console
- Check that Google provider is enabled in Supabase
- Verify Client ID and Secret are correct

## Reverting to Passport.js

If you need to go back to the Passport.js version:

1. Update Procfile:
   ```
   web: node server.js
   ```

2. Deploy:
   ```bash
   git add Procfile
   git commit -m "Revert to Passport.js"
   git push heroku main
   ```

3. Restore environment variables:
   ```bash
   heroku config:set DATABASE_URL="..."
   heroku config:set SESSION_SECRET="..."
   heroku config:set GOOGLE_CLIENT_ID="..."
   heroku config:set GOOGLE_CLIENT_SECRET="..."
   heroku config:set BASE_URL="https://maneki-36d85d517656.herokuapp.com"
   ```

## Benefits of Supabase Auth

✅ No need to manage sessions in PostgreSQL
✅ No need for Passport.js dependencies
✅ Automatic JWT token management
✅ Built-in user management
✅ Works seamlessly with RLS policies
✅ Less code to maintain
✅ More secure (industry-standard implementation)

## Next Steps

Once Supabase Auth is working:
1. Remove Passport.js dependencies from package.json (optional)
2. Delete old files (server.js, views/index.ejs, etc.) if you're sure you don't need them
3. Update your `.gitignore` if needed
