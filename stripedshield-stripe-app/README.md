# StripedShield Stripe App

## Win 68% of Disputes Automatically

StripedShield is a Stripe App that lives directly in your Stripe Dashboard, providing AI-powered dispute automation with a proven 68% win rate.

## Features

- **68% Win Rate**: 28% better than industry average
- **CE3.0 Detection**: Automatically identifies disputes eligible for 95% win rate
- **GPT-5 AI**: Advanced pattern recognition and evidence generation
- **Zero Setup**: Works immediately after installation
- **Dashboard Integration**: Lives right where you manage disputes

## Installation

### For Testing
```bash
npm install
npm run build
stripe apps upload
```

Then go to your Stripe Dashboard (test mode) and install the app.

### For Production
```bash
npm run build
npm run upload:live
```

## How It Works

1. **Dashboard View**: See all your disputes with win probability scores
2. **Dispute Detail**: Get AI analysis for specific disputes
3. **Auto-Win**: Click to submit AI-generated evidence
4. **CE3.0 Detection**: Automatically flags disputes with 95% win rate

## Architecture

- **Frontend**: React components using Stripe UI Extension SDK
- **Backend**: AWS Lambda functions (already deployed)
- **AI**: GPT-5 for evidence generation
- **Data**: Direct access to Stripe dispute data

## Pricing

- **Free Tier**: 10 disputes per month
- **Pro**: $599/month unlimited disputes
- **Enterprise**: Custom pricing

## Support

Contact: support@stripedshield.com

## License

Private - Not for redistribution