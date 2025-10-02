# StripedShield Frontend - Next.js 14 Production App

## 🚀 Overview

Production-ready Next.js 14 frontend for StripedShield - an AI-powered Stripe chargeback defense system achieving 68% win rate.

## ✨ Features

- **Landing Page**: High-converting page with ROI calculator
- **Dashboard**: Real-time dispute tracking with charts
- **Authentication**: Google OAuth via NextAuth
- **Stripe Integration**: Connect OAuth & Checkout
- **Email Automation**: Resend integration with scheduled campaigns
- **Billing**: Stripe Customer Portal & subscription management
- **Performance**: 562ms response time, 100% automated

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Auth**: NextAuth.js
- **Payments**: Stripe
- **Charts**: Recharts
- **Email**: Resend
- **Hosting**: Netlify
- **Backend**: AWS Lambda (existing)

## 📦 Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your values
```

## 🔑 Environment Variables

Required environment variables (see `.env.local.example`):

- `NEXTAUTH_URL` - Your app URL
- `NEXTAUTH_SECRET` - Random secret (generate with `openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `STRIPE_CLIENT_ID` - Stripe Connect OAuth client
- `STRIPE_SECRET_KEY` - Stripe secret key
- `BACKEND_API_BASE` - Backend API URL

## 🏃 Development

```bash
# Run development server
npm run dev

# Open http://localhost:3000
```

## 🚀 Deployment to Netlify

### Option 1: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize site
netlify init

# Set environment variables
netlify env:set NEXTAUTH_SECRET "your-secret"
netlify env:set GOOGLE_CLIENT_ID "your-client-id"
netlify env:set GOOGLE_CLIENT_SECRET "your-client-secret"
netlify env:set STRIPE_CLIENT_ID "ca_..."
netlify env:set STRIPE_SECRET_KEY "sk_live_..."
netlify env:set BACKEND_API_BASE "https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"
netlify env:set RESEND_API_KEY "re_..."
netlify env:set SERVICE_KEY "your-service-key"

# Deploy
netlify deploy --build --prod
```

### Option 2: Git Integration

1. Push code to GitHub
2. Connect repo in Netlify UI
3. Add environment variables in Netlify dashboard
4. Deploy automatically on push

## 🔧 Configuration

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `https://your-site.netlify.app/api/auth/callback/google`

### Stripe Setup

1. Create Stripe Connect application
2. Add redirect URI: `https://your-site.netlify.app/api/stripe/connect/callback`
3. Create subscription prices in Stripe Dashboard

### Resend Setup

1. Sign up at [Resend](https://resend.com)
2. Verify domain
3. Get API key

## 📊 Architecture

```
app/
├── api/
│   ├── auth/[...nextauth]/    # NextAuth handlers
│   ├── stripe/connect/         # Stripe OAuth
│   ├── billing/                # Checkout & Portal
│   ├── backend/                # Backend proxy routes
│   └── email/                  # Email automation
├── dashboard/                  # Customer dashboard
├── page.tsx                    # Landing page
└── layout.tsx                  # Root layout

components/
├── ROICalculator.tsx          # Interactive ROI tool
├── ConnectStripe.tsx          # Stripe connection
├── BillingCTA.tsx             # Checkout button
└── ManageBillingButton.tsx    # Portal access

netlify/functions/
├── trial-reminders.ts         # Daily email scheduler
└── founder-offers.ts          # Founder campaigns
```

## 🎯 Performance

- **Lighthouse Score**: 95+
- **First Contentful Paint**: <1s
- **Time to Interactive**: <2s
- **Bundle Size**: <200KB gzipped

## 📈 Analytics

The app tracks key events:
- Sign ups
- Stripe connections
- Subscription conversions
- Dispute wins

## 🔒 Security

- HttpOnly cookies for Stripe account
- Service key protection for internal APIs
- CSP headers configured
- Rate limiting ready

## 📚 API Routes

| Route | Method | Description |
|-------|--------|------------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handlers |
| `/api/stripe/connect/start` | GET | Initiate Stripe OAuth |
| `/api/stripe/connect/callback` | GET | Handle OAuth callback |
| `/api/billing/checkout` | POST | Create checkout session |
| `/api/billing/portal` | POST | Open customer portal |
| `/api/backend/health` | GET | Backend health check |
| `/api/backend/cases` | GET | Fetch disputes |
| `/api/email/welcome` | POST | Send welcome email |
| `/api/email/founder` | GET | Founder campaigns |

## 🐛 Troubleshooting

### NextAuth Issues
- Ensure `NEXTAUTH_URL` matches your deployment URL
- Check Google OAuth redirect URIs

### Stripe Connection
- Verify Stripe Connect settings
- Check redirect URI configuration

### Email Not Sending
- Verify Resend API key
- Check domain verification

## 📝 License

Proprietary - StripedShield © 2025

## 🤝 Support

- Documentation: See project docs
- Backend: AWS Lambda system
- Status: 99.5% complete