#!/bin/bash

# Add ML Feature Flags to Lambda Functions
echo "🚀 Adding ML Feature Flags to Lambda Functions"
echo "=============================================="
echo ""

# Function to add environment variable to a Lambda function
add_env_var() {
    local func_name=$1
    local var_name=$2
    local var_value=$3
    
    echo -n "  Adding $var_name=$var_value to $func_name..."
    
    # Get current environment variables
    CURRENT_VARS=$(aws lambda get-function-configuration \
        --function-name "$func_name" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo " ❌ Function not found"
        return 1
    fi
    
    # Add new variable to existing ones
    NEW_VARS=$(echo "$CURRENT_VARS" | jq ". + {\"$var_name\": \"$var_value\"}")
    
    # Update function configuration
    aws lambda update-function-configuration \
        --function-name "$func_name" \
        --environment "Variables=$NEW_VARS" \
        --output text --query 'LastModified' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo " ✅"
        sleep 1  # Rate limiting
        return 0
    else
        echo " ❌ Update failed"
        return 1
    fi
}

# Add feature flags to buildEvidence
echo "📦 Updating buildEvidence function:"
add_env_var "chargeback-autopilot-stripe-prod-buildEvidence" "ENABLE_PATTERN_CACHE" "false"
add_env_var "chargeback-autopilot-stripe-prod-buildEvidence" "ENABLE_SCORE_CACHE" "false"
add_env_var "chargeback-autopilot-stripe-prod-buildEvidence" "ENABLE_FRAUD_ML" "false"

echo ""
echo "📦 Updating webhookStripe function:"
add_env_var "chargeback-autopilot-stripe-prod-webhookStripe" "ENABLE_PATTERN_CACHE" "false"
add_env_var "chargeback-autopilot-stripe-prod-webhookStripe" "ENABLE_SCORE_CACHE" "false"
add_env_var "chargeback-autopilot-stripe-prod-webhookStripe" "ENABLE_MODEL_UPDATER" "false"

echo ""
echo "=============================================="
echo "✅ ML Feature Flags Added (All Disabled)"
echo ""
echo "To enable ML features:"
echo ""
echo "1. Pattern Cache (low risk):"
echo "   ./enable-ml-pattern-cache.sh"
echo ""
echo "2. Score Cache (medium risk):"
echo "   ./enable-ml-score-cache.sh"
echo ""
echo "3. Full ML (after testing):"
echo "   ./enable-all-ml.sh"
echo ""