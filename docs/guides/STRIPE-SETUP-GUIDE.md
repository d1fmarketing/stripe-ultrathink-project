# 🔧 STRIPE SETUP GUIDE - STRIPEDSHIELD

## 📝 STEP 1: Get Your Stripe Keys

1. Go to: https://dashboard.stripe.com/apikeys
2. Copy your **Test** keys (for development):
   - **Publishable key**: starts with `pk_test_`
   - **Secret key**: starts with `sk_test_`

## 💳 STEP 2: Create Product & Price

### Option A: Using Stripe Dashboard (EASIER)

1. Go to: https://dashboard.stripe.com/products
2. Click "Add product"
3. Fill in:
   - **Name**: StripedShield Founder Plan
   - **Description**: AI-powered chargeback defense with 68% win rate
   - **Price**: $599.00
   - **Billing**: Recurring / Monthly
   - **Free trial**: 7 days

4. Click "Save product"

### Option B: Using Stripe CLI

```bash
# Install Stripe CLI first
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Create product
stripe products create \
  --name="StripedShield Founder Plan" \
  --description="AI-powered chargeback defense with 68% win rate"

# Note the product ID (prod_xxx), then create price
stripe prices create \
  --product=prod_xxx \
  --unit-amount=59900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[trial_period_days]=7
```

## 🔗 STEP 3: Create Payment Link

1. Go to: https://dashboard.stripe.com/payment-links
2. Click "New link"
3. Select your product (StripedShield Founder Plan)
4. Configure:
   - ✅ Collect email
   - ✅ Allow promotion codes
   - ✅ Don't ask for shipping address
5. Add metadata:
   - Key: `plan`, Value: `founder`
   - Key: `source`, Value: `website`
6. Click "Create link"
7. Copy the link (looks like: `https://buy.stripe.com/test_abc123xyz`)

## 🔄 STEP 4: Setup Webhook

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://xxxuxjmonsoxumcetlgy.supabase.co/functions/v1/stripe-webhook`
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)

## 📄 STEP 5: Update Your Code

### In `checkout.html`:

```javascript
// Line 217 - Replace with your REAL test key
const stripe = Stripe('pk_test_YOUR_REAL_KEY_HERE');

// Line 254 - Replace with your REAL payment link
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/test_YOUR_LINK_HERE';
```

### In Supabase Dashboard:

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to Settings → Edge Functions
4. Create new function: `stripe-webhook`
5. Add environment variables:
   - `STRIPE_SECRET_KEY`: Your secret key
   - `STRIPE_WEBHOOK_SECRET`: Your webhook signing secret

## ✅ STEP 6: Test Your Setup

### Test Payment Flow:

1. Open your checkout page
2. Click "Continue to Secure Checkout"
3. Use test card: `4242 4242 4242 4242`
4. Any future expiry, any CVC
5. Complete payment
6. Check Stripe Dashboard for the payment

### Test Webhook:

```bash
# Using Stripe CLI
stripe trigger checkout.session.completed

# Check Supabase logs for webhook received
```

## 🚀 STEP 7: Go Live (When Ready)

1. Get your **Live** keys from Stripe
2. Replace all `test_` keys with `live_` keys
3. Update payment link to live version
4. Test with a real card (you can refund yourself)

## 🎯 QUICK CHECKLIST

- [ ] Got Stripe test keys
- [ ] Created product ($599/mo with 7-day trial)
- [ ] Generated payment link
- [ ] Configured webhook
- [ ] Updated code with real keys
- [ ] Tested payment flow
- [ ] Webhook receiving events

## 💡 TIPS

1. **Always use test mode first** - Test cards are free
2. **Save your keys securely** - Never commit to git
3. **Monitor webhook logs** - In Stripe Dashboard → Webhooks → Logs
4. **Set up email receipts** - In Stripe Dashboard → Settings → Emails

## 🆘 COMMON ISSUES

### "Invalid API Key"
- Make sure you're using test keys in test mode
- Check for extra spaces or characters

### "Payment Link Not Working"
- Ensure the product is active
- Check if link is for correct mode (test/live)

### "Webhook Not Receiving"
- Verify endpoint URL is correct
- Check signing secret matches
- Look at webhook logs in Stripe Dashboard

## 📞 SUPPORT

- Stripe Docs: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Test Cards: https://stripe.com/docs/testing

---

**Remember**: Start with test mode, get everything working, then switch to live mode!