# 🚀 Deploy Landing Page to Netlify - Quick Guide

## Your Netlify Credentials
```
API Token: nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663
```

## Option 1: Drag & Drop Deploy (EASIEST - 2 minutes)

1. **Go to**: https://app.netlify.com/drop
2. **Drag the `index.html` file** from your computer to the browser
3. **Done!** Your site will be live in seconds
4. **Custom domain**: Click site settings → Domain management

## Option 2: Command Line Deploy (5 minutes)

```bash
# Set your auth token
export NETLIFY_AUTH_TOKEN="nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663"

# Deploy the landing page
npx netlify deploy --prod --dir=.

# When prompted:
# - Choose "Create & configure a new site"
# - Team: Select your team
# - Site name: stripedshield-founders
```

## Option 3: GitHub Deploy (10 minutes)

1. Create a new GitHub repo: `stripedshield-landing`
2. Push your `index.html` to the repo
3. Go to Netlify dashboard
4. Click "New site from Git"
5. Connect GitHub and select your repo
6. Deploy!

## Your Landing Page Content

The landing page (`index.html`) includes:
- ✅ Founder program announcement
- ✅ $599/mo lifetime pricing
- ✅ 68% win rate messaging
- ✅ 554% ROI calculator
- ✅ "7 spots remaining" urgency
- ✅ Email CTA buttons

## After Deployment

1. **Get your URL**: Will be something like `https://stripedshield-founders.netlify.app`
2. **Test it**: Open in incognito to verify
3. **Share it**: Add to email signatures, LinkedIn, etc.
4. **Track it**: Netlify provides basic analytics

## Custom Domain (Optional)

If you have a domain like `stripedshield.com`:
1. Go to Site settings → Domain management
2. Add custom domain
3. Follow DNS instructions
4. SSL certificate auto-generated

## Landing Page Links to Update

Once deployed, update these in your outreach:
- Email templates: Add landing page URL
- LinkedIn posts: Include link
- Twitter bio: Add URL
- Email signature: Add "Learn more" link

## Quick Test

After deployment, verify these work:
- [ ] Page loads fast (<2 seconds)
- [ ] CTA buttons visible
- [ ] Mobile responsive
- [ ] ROI calculator displays correctly
- [ ] Contact email links work

## Support

- Netlify docs: https://docs.netlify.com
- Status page: https://www.netlifystatus.com
- Your token (keep safe): nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663

---

**Ready to deploy? Use Option 1 (drag & drop) - it's literally 30 seconds!**