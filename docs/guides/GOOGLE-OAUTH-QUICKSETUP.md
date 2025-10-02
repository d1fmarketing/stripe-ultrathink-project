# 🚀 Google OAuth Quick Setup for StripedShield

## Your Project Details:
- **Project ID**: secret-country-259415  
- **Service Account**: stripe@secret-country-259415.iam.gserviceaccount.com

## Step 1: Create OAuth 2.0 Credentials (Do this now in your browser)

### Go to this URL:
```
https://console.cloud.google.com/apis/credentials?project=secret-country-259415
```

### Click "+ CREATE CREDENTIALS" → "OAuth client ID"

### If prompted for OAuth consent screen:
1. User Type: **External**
2. App name: **StripedShield**
3. User support email: **Your email**
4. Developer contact: **Your email**
5. Click "SAVE AND CONTINUE"
6. Skip scopes (click "SAVE AND CONTINUE")
7. Add test users if needed
8. Click "SAVE AND CONTINUE"

### Configure the OAuth Client:
**Application type**: Web application  
**Name**: StripedShield Supabase Auth

**Authorized JavaScript origins** (add both):
```
https://xxxuxjmonsoxumcetlgy.supabase.co
https://stripedshield-founders-1755231149.netlify.app
```

**Authorized redirect URIs** (EXACTLY this):
```
https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback
```

### Click "CREATE"

## Step 2: You'll get credentials - SAVE THESE:
- **Client ID**: `[something].apps.googleusercontent.com`
- **Client Secret**: `GOCSPX-[something]`

## Step 3: Configure in Supabase

### Go to:
```
https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers
```

### Find "Google" and:
1. Toggle **Enable Sign in with Google** to ON
2. Paste your **Client ID** 
3. Paste your **Client Secret**
4. Click **Save**

## Step 4: Tell me when done!

Once you've completed steps 1-3, just say:
"Google OAuth is configured"

Then I will:
1. Enable the Google button in your auth page
2. Deploy the changes
3. Test that everything works

## Quick Links:
- [Create OAuth Credentials](https://console.cloud.google.com/apis/credentials?project=secret-country-259415)
- [Supabase Auth Providers](https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers)
- [Your Live Site](https://stripedshield-founders-1755231149.netlify.app)

## Need the credentials again?
You can always view them at:
https://console.cloud.google.com/apis/credentials?project=secret-country-259415