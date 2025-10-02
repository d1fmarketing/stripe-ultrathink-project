# 🧪 TESTING THE PAYMENT FLOW - STEP BY STEP

## ⚠️ IMPORTANT: This is STRIPE LIVE MODE - Real money will be charged!

## Quick Test Options:

### Option 1: Test with Real Card (Can Cancel Later)
1. Go to: https://stripedshield-founders-1755231149.netlify.app/checkout.html
2. Click "Continue to Secure Checkout"
3. Use a real card (you can cancel within 7 days)
4. After payment → Redirected to dashboard

### Option 2: Manual Flow Test (No Payment)
1. Go directly to: https://stripedshield-founders-1755231149.netlify.app/auth.html
2. Sign up with any email
3. Then visit: https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html
4. You'll see the dashboard (in trial mode)

## What Happens Step-by-Step:

### 1. Customer Clicks Payment Link
```
https://buy.stripe.com/aFaeVd4oF7pv0xs9ahc3m01
```

### 2. Stripe Checkout Page
- Customer enters card details
- 7-day free trial starts
- Card is authorized but NOT charged yet

### 3. After Successful Payment
- Stripe redirects to: `/dashboard-protected.html`
- Dashboard checks for authentication
- If not logged in → Redirects to `/auth.html`

### 4. Authentication Flow
- New customer creates account at `/auth.html`
- Uses same email from Stripe checkout
- Gets magic link or uses password

### 5. Protected Dashboard Access
- Shows trial status: "7 days remaining"
- Displays mock disputes and metrics
- After 7 days → Card is charged $599

## Testing Checklist:

- [ ] Landing page loads: https://stripedshield-founders-1755231149.netlify.app
- [ ] ROI calculator works (move sliders)
- [ ] Checkout page loads: /checkout.html
- [ ] Payment link redirects to Stripe
- [ ] Auth page works: /auth.html
- [ ] Dashboard shows after login: /dashboard-protected.html

## Verify in Stripe Dashboard:

1. Login to: https://dashboard.stripe.com
2. Go to "Payments" to see transactions
3. Go to "Customers" to see new signups
4. Go to "Subscriptions" to see trials

## Cancel Test Subscription:

If you test with real card:
1. Go to Stripe Dashboard
2. Find the subscription
3. Click "Cancel subscription"
4. Refund if needed (within trial)

## Current Flow Issue:

**Note**: After Stripe payment, user needs to manually sign up at `/auth.html` with the same email. In production, you'd want to:
1. Auto-create Supabase account after payment
2. Send welcome email with login link
3. Or use Stripe webhook to sync accounts

## Quick Links:

- **Live Site**: https://stripedshield-founders-1755231149.netlify.app
- **Direct Checkout**: https://stripedshield-founders-1755231149.netlify.app/checkout.html
- **Payment Link**: https://buy.stripe.com/aFaeVd4oF7pv0xs9ahc3m01
- **Auth Page**: https://stripedshield-founders-1755231149.netlify.app/auth.html
- **Dashboard**: https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html

## Support:

Having issues? Check:
1. Browser console for errors (F12)
2. Stripe Dashboard for payment status
3. Supabase Dashboard for user accounts