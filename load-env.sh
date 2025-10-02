#\!/bin/bash
# Load environment variables from .env file

if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
  echo "✅ Environment variables loaded from .env"
  echo "   AWS Account: $AWS_ACCOUNT_ID"
  echo "   AWS Region: $AWS_REGION"
  echo "   EC2 Instance: $EC2_INSTANCE_ID"
else
  echo "❌ .env file not found"
fi
