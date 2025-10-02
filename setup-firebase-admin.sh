#!/bin/bash

echo "======================================"
echo "FIREBASE ADMIN SDK SETUP"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "\n${YELLOW}This script will help you configure Firebase Admin SDK for production.${NC}"
echo ""
echo "STEPS TO GET YOUR FIREBASE SERVICE ACCOUNT:"
echo "1. Go to https://console.firebase.google.com"
echo "2. Select your project (stripecharge-b27a6)"
echo "3. Click on the gear icon ⚙️ next to 'Project Overview'"
echo "4. Select 'Project settings'"
echo "5. Go to 'Service accounts' tab"
echo "6. Click 'Generate new private key'"
echo "7. Save the downloaded JSON file"
echo ""

read -p "Do you have your Firebase service account JSON file ready? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please get your service account file first, then run this script again."
    exit 1
fi

echo ""
read -p "Enter the path to your Firebase service account JSON file: " SERVICE_ACCOUNT_PATH

if [ ! -f "$SERVICE_ACCOUNT_PATH" ]; then
    echo -e "${RED}File not found: $SERVICE_ACCOUNT_PATH${NC}"
    exit 1
fi

# Read the service account file
SERVICE_ACCOUNT_JSON=$(cat "$SERVICE_ACCOUNT_PATH")

# Store in SSM Parameter Store (secure)
echo -e "\n${YELLOW}Storing Firebase credentials in AWS SSM Parameter Store...${NC}"

aws ssm put-parameter \
    --name "/stripedshield/prod/FIREBASE_SERVICE_ACCOUNT" \
    --type "SecureString" \
    --value "$SERVICE_ACCOUNT_JSON" \
    --description "Firebase Admin SDK Service Account for StripedShield" \
    --overwrite

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firebase service account stored successfully in SSM!${NC}"
else
    echo -e "${RED}❌ Failed to store Firebase service account in SSM${NC}"
    exit 1
fi

# Also store the project ID separately for convenience
PROJECT_ID=$(echo "$SERVICE_ACCOUNT_JSON" | jq -r '.project_id')

aws ssm put-parameter \
    --name "/stripedshield/prod/FIREBASE_PROJECT_ID" \
    --type "String" \
    --value "$PROJECT_ID" \
    --description "Firebase Project ID for StripedShield" \
    --overwrite

echo -e "${GREEN}✅ Firebase project ID stored: $PROJECT_ID${NC}"

# Update Lambda environment variables to use SSM
echo -e "\n${YELLOW}Updating Lambda functions to use Firebase credentials...${NC}"

# Update the serverless.yml to include Firebase environment variable
cat << 'EOF' > firebase-env-update.yml
# Add this to your serverless.yml environment section:
    FIREBASE_SERVICE_ACCOUNT: ${ssm:/stripedshield/prod/FIREBASE_SERVICE_ACCOUNT~true}
    FIREBASE_PROJECT_ID: ${ssm:/stripedshield/prod/FIREBASE_PROJECT_ID}
EOF

echo -e "${GREEN}✅ Firebase configuration complete!${NC}"
echo ""
echo "NEXT STEPS:"
echo "1. Add these lines to serverless.yml environment section:"
echo "   FIREBASE_SERVICE_ACCOUNT: \${ssm:/stripedshield/prod/FIREBASE_SERVICE_ACCOUNT~true}"
echo "   FIREBASE_PROJECT_ID: \${ssm:/stripedshield/prod/FIREBASE_PROJECT_ID}"
echo ""
echo "2. Deploy with: npx serverless deploy --stage prod"
echo ""
echo "3. Test authentication endpoints to verify Firebase is working"

# Cleanup
rm -f firebase-env-update.yml

echo -e "\n${GREEN}Setup complete! Firebase Admin SDK is now configured.${NC}"