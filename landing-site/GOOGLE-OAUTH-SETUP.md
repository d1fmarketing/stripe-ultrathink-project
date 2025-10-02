# 🔐 Google OAuth Setup Guide

## Current Status
- ❌ Google button is disabled (commented out)
- ⏳ Waiting for Google OAuth credentials
- ⏳ Waiting for Supabase configuration

## Step 1: Create Google OAuth Credentials

### 1. Go to Google Cloud Console
```
https://console.cloud.google.com/apis/credentials
```

### 2. Create New OAuth Client ID
- Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
- If prompted to configure consent screen:
  - User Type: External
  - App name: StripedShield
  - Support email: Your email
  - No need to add scopes
  - Add test users if needed

### 3. Configure OAuth Client
**Application type:** Web application  
**Name:** StripedShield Auth

**Authorized JavaScript origins:**
```
https://xxxuxjmonsoxumcetlgy.supabase.co
https://stripedshield-founders-1755231149.netlify.app
```

**Authorized redirect URIs:**
```
https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback
```

### 4. Copy Credentials
After clicking "Create", you'll get:
- **Client ID**: `[long-string].apps.googleusercontent.com`
- **Client Secret**: `GOCSPX-[random-string]`

## Step 2: Configure in Supabase

### 1. Go to Supabase Auth Providers
```
https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers
```

### 2. Enable Google
- Toggle **"Enable Sign in with Google"** to ON
- **Client IDs:** Paste your Client ID
- **Client Secret:** Paste your Client Secret
- Leave **"Skip nonce checks"** unchecked
- Click **"Save"**

## Step 3: Tell Me When Done

Once you've completed Steps 1 & 2, tell me:
"Google OAuth is configured in Supabase"

Then I will:
1. Re-enable the Google button
2. Deploy the changes
3. Test that it works

## Quick Checklist
- [ ] Created OAuth Client ID in Google Cloud Console
- [ ] Added correct JavaScript origins
- [ ] Added correct redirect URI
- [ ] Copied Client ID and Secret
- [ ] Enabled Google in Supabase
- [ ] Pasted credentials in Supabase
- [ ] Clicked Save in Supabase

## Need Help?
If you get stuck, common issues:
- Make sure redirect URI is EXACTLY: `https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback`
- Don't add trailing slashes
- Use the Web application type, not Android or iOS