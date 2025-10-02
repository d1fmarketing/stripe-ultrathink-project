#!/bin/bash

# EC2 Setup Script for Stripe Ultrathink Project
# Run this on the EC2 instance after connecting

echo "🚀 Setting up Stripe Ultrathink Project on EC2"
echo "============================================="

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install global packages
echo "📦 Installing global NPM packages..."
sudo npm install -g pm2 serverless typescript tsx

# Navigate to project
cd ~/STRIPE_ULTRATHINK_PROJECT

# Install project dependencies
echo "📦 Installing project dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
STRIPE_CLIENT_ID=ca_YOUR_CLIENT_ID_HERE
STRIPE_REDIRECT_URI=https://your-domain.com/auth/stripe/callback

# AWS Configuration (will use IAM role)
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=330140023537

# Environment
NODE_ENV=production
LOG_LEVEL=info

# SES Configuration
SES_FROM=noreply@chargebackautopilot.com
SES_DEFAULT_TO=admin@chargebackautopilot.com
EOF
    echo "⚠️  Please update .env with your actual Stripe keys!"
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build 2>/dev/null || echo "Build script will be configured later"

# Set up PM2 ecosystem file
echo "⚙️ Setting up PM2 ecosystem..."
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'stripe-autopilot',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production'
    },
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Create startup script
cat > start.sh << 'EOF'
#!/bin/bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
EOF
chmod +x start.sh

echo ""
echo "✅ EC2 Setup Complete!"
echo "======================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Stripe keys:"
echo "   nano .env"
echo ""
echo "2. Configure AWS credentials (if needed):"
echo "   aws configure"
echo ""
echo "3. Deploy serverless infrastructure:"
echo "   npm run deploy"
echo ""
echo "4. Start the application:"
echo "   ./start.sh"
echo ""
echo "Instance Details:"
echo "- Public IP: $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "- Instance ID: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)"
echo "- Region: us-east-1"