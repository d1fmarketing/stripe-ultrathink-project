#!/bin/bash

# EC2 Connection Script for Stripe Ultrathink Project
# Created: August 12, 2025
# Updated: August 12, 2025 - Added Elastic IP

EC2_IP="44.207.87.228"  # Elastic IP (permanent)
KEY_FILE="$HOME/.ssh/stripe-ultrathink-key.pem"
INSTANCE_ID="i-05ace22316e42f336"

echo "🚀 Stripe Ultrathink EC2 Connection"
echo "=================================="
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $EC2_IP"
echo "Key File: $KEY_FILE"
echo ""

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Key file not found: $KEY_FILE"
    exit 1
fi

# Connect to EC2
echo "📡 Connecting to EC2 instance..."
ssh -i "$KEY_FILE" ubuntu@$EC2_IP