# How to Enable Google OAuth

## Problem
Google OAuth button was showing error: "Unsupported provider: provider is not enabled"

## Solution Applied
Google button has been commented out in auth.html to prevent errors

## To Enable Google OAuth:

### 1. Go to Supabase Dashboard
https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers

### 2. Enable Google Provider
- Find "Google" in the providers list
- Toggle it ON

### 3. Get Google OAuth Credentials
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create a new OAuth 2.0 Client ID
3. Add authorized redirect URI:
   ```
   https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback
   ```
4. Copy the Client ID and Client Secret

### 4. Add to Supabase
- Paste Client ID and Secret in Supabase
- Save changes

### 5. Re-enable the Button
Edit `/landing-site/auth.html`:
- Remove the comment tags around the Google button (lines 67-78)
- Remove the comment tags around the divider (lines 55-63)

### 6. Deploy
```bash
NETLIFY_AUTH_TOKEN=nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663 npx netlify deploy --prod --dir=.
```

## Current Status
✅ Email/Password auth works
✅ Magic link auth works
❌ Google OAuth disabled (to prevent errors)

## Test Auth Without Google:
1. Go to: https://stripedshield-founders-1755231149.netlify.app/auth.html
2. Use "Sign up" with email/password
3. This works immediately!