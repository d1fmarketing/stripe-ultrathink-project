#!/usr/bin/env python3
import boto3
import json
import time

lambda_client = boto3.client('lambda', region_name='us-east-1')

# DynamoDB table names
table_vars = {
    "DYNAMODB_TABLE_CASES": "chargeback-autopilot-stripe-prod-CasesTable-1LPIUKCN82FYI",
    "DYNAMODB_TABLE_EVIDENCE": "chargeback-autopilot-stripe-prod-EvidenceTable-1UMDGN8ZAH7IT",
    "DYNAMODB_TABLE_MERCHANTS": "chargeback-autopilot-stripe-prod-MerchantsTable-51TCFUV1R406",
    "DYNAMODB_TABLE_SUBMISSIONS": "chargeback-autopilot-stripe-prod-SubmissionsTable-1OW6115T4W4O5",
    "CASES_TABLE": "chargeback-autopilot-stripe-prod-CasesTable-1LPIUKCN82FYI",
    "EVIDENCE_TABLE": "chargeback-autopilot-stripe-prod-EvidenceTable-1UMDGN8ZAH7IT",
    "MERCHANTS_TABLE": "chargeback-autopilot-stripe-prod-MerchantsTable-51TCFUV1R406",
    "SUBMISSIONS_TABLE": "chargeback-autopilot-stripe-prod-SubmissionsTable-1OW6115T4W4O5"
}

print("🔧 CONFIGURING DYNAMODB FOR ALL FUNCTIONS")
print("=" * 50)

# Get all Lambda functions
functions = lambda_client.list_functions()['Functions']
prod_functions = [f for f in functions if f['FunctionName'].startswith('chargeback-autopilot-stripe-prod')]

success = 0
failed = 0

for func in prod_functions:
    func_name = func['FunctionName']
    short_name = func_name.replace('chargeback-autopilot-stripe-prod-', '')
    
    try:
        # Get current configuration
        current_config = lambda_client.get_function_configuration(FunctionName=func_name)
        current_vars = current_config.get('Environment', {}).get('Variables', {})
        
        # Merge with DynamoDB tables
        updated_vars = {**current_vars, **table_vars}
        
        print(f"Updating {short_name}... ", end='')
        
        # Update function configuration
        lambda_client.update_function_configuration(
            FunctionName=func_name,
            Environment={'Variables': updated_vars}
        )
        
        print("✅")
        success += 1
        
        # Small delay to avoid throttling
        time.sleep(0.5)
        
    except Exception as e:
        print(f"❌ {str(e)}")
        failed += 1

print(f"\n{'=' * 50}")
print(f"Results: ✅ {success} succeeded, ❌ {failed} failed")
print(f"System configuration: {(success / len(prod_functions)) * 100:.0f}% complete")