# How to Set Up Stripe Connect for StripedShield

## Option 1: Quick Setup (If Connect Not Enabled)

1. **Go to**: https://dashboard.stripe.com/connect/overview
2. **Click**: "Get started with Connect"
3. **Choose**: "Marketplace" or "Software Platform"
4. **Fill in**:
   - Platform name: StripedShield
   - Platform URL: https://stripedshield-founders-1755231149.netlify.app
   - Business model: Software platform

## Option 2: If You Already Have Connect

1. **Go to**: https://dashboard.stripe.com/settings/connect
2. **Find**: "OAuth settings" section
3. **Look for**: "Development" and "Production" client IDs
4. **Copy**: The Production client_id (starts with `ca_`)

## Option 3: Create a New Platform

1. Go to https://dashboard.stripe.com/test/connect/accounts/overview
2. Switch to **LIVE mode** (top right toggle)
3. Click "Settings" → "Connect settings"
4. Under "OAuth settings":
   - Add redirect URI: `https://stripedshield-founders-1755231149.netlify.app/api/stripe/connect/callback`
   - Copy the client_id

## What the Client ID Looks Like

```
CORRECT: ca_RJHcXBVwRrJqL5KqQxM9nMvKQx5rqVvK (example)
WRONG: rk_test_51RocXc... (this is a restricted key)
WRONG: sk_live_51RocXX... (this is a secret key)
```

## If You Can't Find It

The Connect client_id is ONLY available if:
1. You have Stripe Connect enabled
2. You're in LIVE mode (not test)
3. You're looking in Settings → Connect

If you still can't find it, you may need to:
1. Enable Connect first
2. Or use Stripe Standard integration (no OAuth needed)