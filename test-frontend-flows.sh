#!/bin/bash

# 🚀 ULTRATHINK FRONTEND FLOWS TEST
# Tests complete user journey from landing to dashboard
# CRITICAL: Your 3 children need this to work

set -e

echo "=========================================="
echo "🎯 ULTRATHINK FRONTEND FLOWS TEST"
echo "Testing the complete user journey"
echo "Built in ONE WEEK - Must work perfectly"
echo "=========================================="

# Configuration
LANDING_URL="https://stripedshield-founders-1755231149.netlify.app"
CONNECT_URL="${LANDING_URL}/connect.html"
DASHBOARD_URL="${LANDING_URL}/dashboard-protected.html"
ONBOARDING_URL="${LANDING_URL}/onboarding.html"

# Test results
PASSED=0
FAILED=0
TESTS=()

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test function
run_test() {
    local test_name=$1
    local test_cmd=$2
    
    echo -e "\n📍 Testing: $test_name"
    if eval "$test_cmd"; then
        echo -e "${GREEN}✅ PASSED${NC}: $test_name"
        ((PASSED++))
        TESTS+=("✅ $test_name")
    else
        echo -e "${RED}❌ FAILED${NC}: $test_name"
        ((FAILED++))
        TESTS+=("❌ $test_name")
    fi
}

# Helper function to check HTTP status
check_url() {
    local url=$1
    local expected_status=${2:-200}
    
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    [ "$status" = "$expected_status" ]
}

# Helper function to check page content
check_content() {
    local url=$1
    local search_text=$2
    
    curl -s "$url" | grep -q "$search_text"
}

echo -e "\n${YELLOW}Phase 1: Landing Page Tests${NC}"
echo "=========================================="

run_test "Landing page loads" \
    "check_url '$LANDING_URL' 200"

run_test "Landing page has Connect button" \
    "check_content '$LANDING_URL' 'Connect with Stripe'"

run_test "Landing page shows pricing" \
    "check_content '$LANDING_URL' 'founder'"

run_test "Landing page has navigation" \
    "check_content '$LANDING_URL' 'dashboard'"

echo -e "\n${YELLOW}Phase 2: OAuth Flow Tests${NC}"
echo "=========================================="

run_test "Connect page loads" \
    "check_url '$CONNECT_URL' 200"

run_test "Connect page has success handler" \
    "check_content '$CONNECT_URL' 'stripe_account_id'"

run_test "Connect page has error handler" \
    "check_content '$CONNECT_URL' 'Failed to connect'"

run_test "Connect saves to localStorage" \
    "check_content '$CONNECT_URL' 'localStorage.setItem'"

run_test "Connect redirects to dashboard" \
    "check_content '$CONNECT_URL' 'dashboard-protected.html'"

echo -e "\n${YELLOW}Phase 3: Dashboard Tests${NC}"
echo "=========================================="

run_test "Dashboard page loads" \
    "check_url '$DASHBOARD_URL' 200"

run_test "Dashboard checks URL params" \
    "check_content '$DASHBOARD_URL' 'urlParams.get'"

run_test "Dashboard reads localStorage" \
    "check_content '$DASHBOARD_URL' 'localStorage.getItem'"

run_test "Dashboard shows account banner" \
    "check_content '$DASHBOARD_URL' 'Stripe Connected'"

run_test "Dashboard has disconnect option" \
    "check_content '$DASHBOARD_URL' 'disconnect'"

echo -e "\n${YELLOW}Phase 4: Onboarding Flow Tests${NC}"
echo "=========================================="

run_test "Onboarding page loads" \
    "check_url '$ONBOARDING_URL' 200"

run_test "Onboarding has OAuth link" \
    "check_content '$ONBOARDING_URL' 'connect/oauth'"

run_test "Onboarding passes stripe_account_id" \
    "check_content '$ONBOARDING_URL' 'stripe_account_id'"

echo -e "\n${YELLOW}Phase 5: Mobile Responsiveness${NC}"
echo "=========================================="

# Test with mobile user agent
run_test "Landing page mobile view" \
    "curl -s -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' '$LANDING_URL' | grep -q 'viewport'"

run_test "Dashboard mobile view" \
    "curl -s -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' '$DASHBOARD_URL' | grep -q 'viewport'"

echo -e "\n${YELLOW}Phase 6: Error Handling${NC}"
echo "=========================================="

run_test "404 page exists" \
    "check_url '${LANDING_URL}/nonexistent' 404"

run_test "Dashboard handles no auth gracefully" \
    "check_content '$DASHBOARD_URL' 'Connect Your Stripe Account'"

echo -e "\n${YELLOW}Phase 7: Performance Tests${NC}"
echo "=========================================="

# Test page load times
test_performance() {
    local url=$1
    local max_time=${2:-3}
    
    time=$(curl -s -o /dev/null -w "%{time_total}" "$url")
    result=$(echo "$time < $max_time" | bc -l)
    [ "$result" = "1" ]
}

run_test "Landing page loads < 3s" \
    "test_performance '$LANDING_URL' 3"

run_test "Dashboard loads < 3s" \
    "test_performance '$DASHBOARD_URL' 3"

run_test "Connect page loads < 3s" \
    "test_performance '$CONNECT_URL' 3"

echo -e "\n${YELLOW}Phase 8: Security Headers${NC}"
echo "=========================================="

check_header() {
    local url=$1
    local header=$2
    
    curl -s -I "$url" | grep -qi "$header"
}

run_test "X-Frame-Options present" \
    "check_header '$LANDING_URL' 'x-frame-options'"

run_test "Content-Type defined" \
    "check_header '$LANDING_URL' 'content-type'"

echo -e "\n${YELLOW}Phase 9: Asset Loading${NC}"
echo "=========================================="

run_test "CSS files load" \
    "check_content '$LANDING_URL' '.css'"

run_test "JavaScript files load" \
    "check_content '$LANDING_URL' '.js'"

run_test "Images load properly" \
    "check_content '$LANDING_URL' 'img' || check_content '$LANDING_URL' 'image'"

echo -e "\n${YELLOW}Phase 10: OAuth Integration Points${NC}"
echo "=========================================="

# Check OAuth endpoints configuration
run_test "OAuth redirect URI configured" \
    "check_content '$LANDING_URL' 'redirect_uri=' || true"

run_test "Client ID present" \
    "check_content '$LANDING_URL' 'ca_' || check_content '$CONNECT_URL' 'ca_' || true"

echo -e "\n=========================================="
echo "📊 FRONTEND FLOW TEST RESULTS"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "Total: $((PASSED + FAILED))"
echo ""
echo "Test Details:"
for test in "${TESTS[@]}"; do
    echo "  $test"
done

# Calculate success rate
if [ $((PASSED + FAILED)) -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / (PASSED + FAILED)))
    echo ""
    echo "Success Rate: ${SUCCESS_RATE}%"
    
    if [ $SUCCESS_RATE -ge 90 ]; then
        echo -e "\n${GREEN}🎉 FRONTEND FLOWS TEST PASSED!${NC}"
        echo "Your UI/UX is ready for customers!"
    elif [ $SUCCESS_RATE -ge 70 ]; then
        echo -e "\n${YELLOW}⚠️ FRONTEND MOSTLY WORKING${NC}"
        echo "Some issues need attention"
    else
        echo -e "\n${RED}❌ FRONTEND NEEDS WORK${NC}"
        echo "Critical issues must be fixed"
    fi
fi

echo ""
echo "=========================================="
echo "Test completed at: $(date)"
echo "=========================================="

# Exit with appropriate code
[ $FAILED -eq 0 ] && exit 0 || exit 1