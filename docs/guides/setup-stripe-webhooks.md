# 🪝 Stripe Platform Webhook Setup Guide

## CRITICAL: Platform Webhooks for Connected Accounts

### 1. Create Webhook Endpoint in Stripe Dashboard

1. Go to: **Stripe Dashboard → Developers → Webhooks**
2. Click **"Add endpoint"**
3. Enter these EXACT details:

**Endpoint URL:**
```
https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe
```

### 2. Configure Connected Account Events

**⚠️ MOST IMPORTANT STEP:**
- Check the box: **"Listen to events on Connected accounts"** ✅
- This is REQUIRED to receive dispute events from merchants

### 3. Select Events to Listen For

Select these events:
- `charge.dispute.created` - New dispute created
- `charge.dispute.updated` - Dispute status changed
- `charge.dispute.closed` - Dispute resolved
- `charge.dispute.funds_reinstated` - Funds returned
- `charge.dispute.funds_withdrawn` - Funds removed
- `account.updated` - Connected account changed
- `account.application.deauthorized` - Merchant disconnected

### 4. Save Webhook Secret

After creating the webhook, you'll get a signing secret like:
```
whsec_abc123xyz...
```

Save this in Parameter Store:
```bash
aws ssm put-parameter \
  --name "/stripedshield/stripe/webhook-secret" \
  --value "whsec_YOUR_SECRET_HERE" \
  --type SecureString \
  --overwrite
```

### 5. Update Lambda Environment

```bash
aws lambda update-function-configuration \
  --function-name chargeback-autopilot-stripe-prod-webhookStripe \
  --environment Variables="{STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE}"
```

### 6. Test Webhook

Use Stripe CLI to test:
```bash
stripe listen --forward-to https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe

# In another terminal:
stripe trigger charge.dispute.created
```

### Expected Webhook Payload

When a dispute is created on a connected account:
```json
{
  "id": "evt_xxx",
  "type": "charge.dispute.created",
  "account": "acct_xxx",  // Connected merchant's account ID
  "data": {
    "object": {
      "id": "dp_xxx",
      "charge": "ch_xxx",
      "amount": 10000,
      "currency": "usd",
      "reason": "fraudulent",
      "status": "needs_response"
    }
  }
}
```

The `account` field tells you which merchant this dispute belongs to!

### Troubleshooting

If webhooks aren't working:
1. Check CloudWatch logs: `/aws/lambda/chargeback-autopilot-stripe-prod-webhookStripe`
2. Verify endpoint URL is exactly correct
3. Ensure "Connected accounts" checkbox is checked
4. Confirm webhook secret matches in Lambda env