#!/bin/bash

# Script to test all merobox workflows
# Usage: 
#   ./scripts/test-workflows.sh                    # Test all workflows
#   ./scripts/test-workflows.sh --verbose          # Test all with verbose output
#   ./scripts/test-workflows.sh simple-counter      # Test specific workflow
#   ./scripts/test-workflows.sh workflow-simple-counter.yml  # Test with full name

set -e

WORKFLOWS_DIR="merobox-workflows"
VERBOSE=false
SPECIFIC_WORKFLOW=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] [WORKFLOW_NAME]"
      echo ""
      echo "Test merobox workflows"
      echo ""
      echo "Options:"
      echo "  --verbose, -v    Show detailed output for each workflow"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Test all workflows"
      echo "  $0 --verbose                          # Test all with verbose output"
      echo "  $0 simple-counter                     # Test specific workflow"
      echo "  $0 workflow-simple-counter.yml        # Test with full filename"
      exit 0
      ;;
    *)
      SPECIFIC_WORKFLOW="$1"
      shift
      ;;
  esac
done

# Check if merobox is installed
if ! command -v merobox &> /dev/null; then
  echo "❌ Error: merobox command not found"
  echo "   Please install merobox: https://github.com/calimero-network/merobox"
  exit 1
fi

# Get all workflow files
if [ -n "$SPECIFIC_WORKFLOW" ]; then
  # Test specific workflow
  if [[ "$SPECIFIC_WORKFLOW" != *.yml ]]; then
    SPECIFIC_WORKFLOW="${SPECIFIC_WORKFLOW}.yml"
  fi
  if [[ "$SPECIFIC_WORKFLOW" != workflow-* ]]; then
    SPECIFIC_WORKFLOW="workflow-${SPECIFIC_WORKFLOW}"
  fi
  WORKFLOWS=("$WORKFLOWS_DIR/$SPECIFIC_WORKFLOW")
  
  if [ ! -f "${WORKFLOWS[0]}" ]; then
    echo "❌ Error: Workflow file not found: ${WORKFLOWS[0]}"
    exit 1
  fi
else
  # Get all workflow files
  WORKFLOWS=("$WORKFLOWS_DIR"/workflow-*.yml)
fi

if [ ${#WORKFLOWS[@]} -eq 0 ] || [ ! -f "${WORKFLOWS[0]}" ]; then
  echo "❌ Error: No workflow files found in $WORKFLOWS_DIR"
  exit 1
fi

echo "🧪 Testing ${#WORKFLOWS[@]} workflow(s)..."
echo ""

# Track results
PASSED=0
FAILED=0
FAILED_WORKFLOWS=()

# Test each workflow
for workflow in "${WORKFLOWS[@]}"; do
  workflow_name=$(basename "$workflow")
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 Testing: $workflow_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [ "$VERBOSE" = true ]; then
    echo "Running: merobox bootstrap run $workflow"
    echo ""
  fi
  
  # Run the workflow
  if merobox bootstrap run "$workflow" > /tmp/merobox-${workflow_name}.log 2>&1; then
    echo "✅ PASSED: $workflow_name"
    ((PASSED++))
  else
    echo "❌ FAILED: $workflow_name"
    ((FAILED++))
    FAILED_WORKFLOWS+=("$workflow_name")
    
    if [ "$VERBOSE" = true ]; then
      echo ""
      echo "Error output:"
      cat /tmp/merobox-${workflow_name}.log
      echo ""
    else
      echo "   Run with --verbose to see error details"
      echo "   Log saved to: /tmp/merobox-${workflow_name}.log"
    fi
  fi
  
  echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "Failed workflows:"
  for failed in "${FAILED_WORKFLOWS[@]}"; do
    echo "  - $failed"
  done
  echo ""
  echo "To see error details, run:"
  echo "  cat /tmp/merobox-<workflow-name>.log"
  echo ""
  exit 1
else
  echo "🎉 All workflows passed!"
  exit 0
fi

