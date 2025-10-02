#!/bin/bash

# Monitor webhook health and dispute processing

echo "🔍 ULTRATHINK: Webhook Monitoring Dashboard"
echo "==========================================="
echo "Started: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load webhook config
if [ -f webhook-config.txt ]; then
    source webhook-config.txt
fi

# Function to check webhook health
check_webhook_health() {
    echo -e "${YELLOW}📡 Webhook Health Check${NC}"
    echo "------------------------"
    
    # Get webhook details from Stripe
    WEBHOOK_STATUS=$(stripe webhook_endpoints retrieve $WEBHOOK_ID 2>/dev/null | jq -r '.status')
    WEBHOOK_ENABLED=$(stripe webhook_endpoints retrieve $WEBHOOK_ID 2>/dev/null | jq -r '.enabled_events | length')
    
    if [ "$WEBHOOK_STATUS" = "enabled" ]; then
        echo -e "${GREEN}✅ Webhook Status: ENABLED${NC}"
        echo "   Events configured: $WEBHOOK_ENABLED"
    else
        echo -e "${RED}❌ Webhook Status: $WEBHOOK_STATUS${NC}"
    fi
    echo ""
}

# Function to monitor CloudWatch errors
monitor_errors() {
    echo -e "${YELLOW}🚨 Recent Errors (Last 10 mins)${NC}"
    echo "--------------------------------"
    
    ERROR_COUNT=$(aws logs filter-log-events \
        --log-group-name /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe \
        --start-time $(($(date +%s) - 600))000 \
        --filter-pattern "ERROR" \
        --query 'events | length(@)' \
        --output text 2>/dev/null)
    
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}❌ Found $ERROR_COUNT errors!${NC}"
        aws logs filter-log-events \
            --log-group-name /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe \
            --start-time $(($(date +%s) - 600))000 \
            --filter-pattern "ERROR" \
            --query 'events[0:3].[message]' \
            --output text 2>/dev/null
    else
        echo -e "${GREEN}✅ No errors in last 10 minutes${NC}"
    fi
    echo ""
}

# Function to show dispute processing stats
dispute_stats() {
    echo -e "${YELLOW}📊 Dispute Processing Stats${NC}"
    echo "---------------------------"
    
    # Count disputes in DynamoDB
    TOTAL_DISPUTES=$(aws dynamodb scan \
        --table-name chargeback-autopilot-stripe-dev-CasesTable \
        --select COUNT \
        --query 'Count' \
        --output text 2>/dev/null || echo "0")
    
    echo "Total disputes tracked: $TOTAL_DISPUTES"
    
    # Get recent disputes
    echo "Recent disputes (last 24h):"
    aws logs filter-log-events \
        --log-group-name /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe \
        --start-time $(($(date +%s) - 86400))000 \
        --filter-pattern '"dispute.created"' \
        --query 'events | length(@)' \
        --output text 2>/dev/null | xargs -I {} echo "  Processed: {} disputes"
    
    echo ""
}

# Function to check CE3 detection
ce3_detection() {
    echo -e "${YELLOW}🎯 CE3.0 Detection Activity${NC}"
    echo "---------------------------"
    
    CE3_COUNT=$(aws logs filter-log-events \
        --log-group-name /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe \
        --start-time $(($(date +%s) - 3600))000 \
        --filter-pattern '"ce3_eligible"' \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$CE3_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✅ CE3.0 checks performed: $CE3_COUNT${NC}"
    else
        echo "No CE3.0 activity in last hour"
    fi
    echo ""
}

# Function to show Lambda metrics
lambda_metrics() {
    echo -e "${YELLOW}⚡ Lambda Performance${NC}"
    echo "----------------------"
    
    # Get invocation count
    INVOCATIONS=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/Lambda \
        --metric-name Invocations \
        --dimensions Name=FunctionName,Value=chargeback-autopilot-stripe-dev-webhookStripe \
        --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 3600 \
        --statistics Sum \
        --query 'Datapoints[0].Sum' \
        --output text 2>/dev/null || echo "0")
    
    # Get error count
    ERRORS=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/Lambda \
        --metric-name Errors \
        --dimensions Name=FunctionName,Value=chargeback-autopilot-stripe-dev-webhookStripe \
        --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 3600 \
        --statistics Sum \
        --query 'Datapoints[0].Sum' \
        --output text 2>/dev/null || echo "0")
    
    echo "Invocations (last hour): $INVOCATIONS"
    echo "Errors (last hour): $ERRORS"
    
    if [ "$ERRORS" = "0" ] || [ "$ERRORS" = "None" ]; then
        echo -e "${GREEN}✅ No Lambda errors${NC}"
    else
        echo -e "${RED}⚠️  Lambda errors detected: $ERRORS${NC}"
    fi
    echo ""
}

# Function to test webhook connectivity
test_connectivity() {
    echo -e "${YELLOW}🔌 Webhook Connectivity Test${NC}"
    echo "-----------------------------"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{"test": true}' \
        --max-time 5)
    
    if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ]; then
        echo -e "${GREEN}✅ Webhook endpoint reachable (Status: $HTTP_STATUS)${NC}"
    elif [ "$HTTP_STATUS" = "200" ]; then
        echo -e "${YELLOW}⚠️  Webhook accepting unsigned requests (Status: $HTTP_STATUS)${NC}"
    else
        echo -e "${RED}❌ Webhook unreachable (Status: $HTTP_STATUS)${NC}"
    fi
    echo ""
}

# Main monitoring loop
if [ "$1" = "--continuous" ]; then
    echo "Running in continuous mode (Ctrl+C to stop)..."
    echo ""
    while true; do
        clear
        echo "🔍 ULTRATHINK: Webhook Monitoring Dashboard"
        echo "==========================================="
        echo "Updated: $(date)"
        echo ""
        
        check_webhook_health
        test_connectivity
        monitor_errors
        dispute_stats
        ce3_detection
        lambda_metrics
        
        echo "Refreshing in 30 seconds..."
        sleep 30
    done
else
    # Single run
    check_webhook_health
    test_connectivity
    monitor_errors
    dispute_stats
    ce3_detection
    lambda_metrics
    
    echo "==========================================="
    echo -e "${GREEN}✅ Monitoring check complete!${NC}"
    echo ""
    echo "Tips:"
    echo "  • Run with --continuous for live monitoring"
    echo "  • Check CloudWatch for detailed logs"
    echo "  • Use test-webhook.sh to trigger test disputes"
fi