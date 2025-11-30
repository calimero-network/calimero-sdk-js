#!/bin/bash

# Script to test all merobox workflows
# Usage: 
#   ./scripts/test-workflows.sh                    # Test all workflows
#   ./scripts/test-workflows.sh --verbose          # Test all with verbose output
#   ./scripts/test-workflows.sh counter            # Test specific workflow
#   ./scripts/test-workflows.sh counter-js.yml     # Test with full filename

set -e

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
      echo "Test merobox workflows from examples directories"
      echo ""
      echo "Options:"
      echo "  --verbose, -v    Show detailed output for each workflow"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Test all workflows"
      echo "  $0 --verbose                          # Test all with verbose output"
      echo "  $0 counter                            # Test specific workflow"
      echo "  $0 counter-js.yml                     # Test with full filename"
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

# Find all workflow files in examples directories
# Look for .yml files in examples/*/workflows/ and examples/*/default.yml
find_workflows() {
  local workflows=()
  # Find workflows in workflows/ subdirectories
  while IFS= read -r -d '' file; do
    workflows+=("$file")
  done < <(find examples -type f -name "*.yml" -path "*/workflows/*" -print0 2>/dev/null)
  # Find default.yml files in example directories (excluding workflows subdirectories)
  while IFS= read -r -d '' file; do
    workflows+=("$file")
  done < <(find examples -type f -name "default.yml" ! -path "*/workflows/*" -print0 2>/dev/null)
  printf '%s\n' "${workflows[@]}"
}

# Get all workflow files
if [ -n "$SPECIFIC_WORKFLOW" ]; then
  # Test specific workflow - try to find it by name
  WORKFLOW_FOUND=""
  # Try exact match first
  for workflow in $(find_workflows); do
    if [[ "$(basename "$workflow")" == "$SPECIFIC_WORKFLOW" ]] || \
       [[ "$(basename "$workflow" .yml)" == "$SPECIFIC_WORKFLOW" ]] || \
       [[ "$workflow" == *"$SPECIFIC_WORKFLOW"* ]]; then
      WORKFLOW_FOUND="$workflow"
      break
    fi
  done
  
  if [ -z "$WORKFLOW_FOUND" ] || [ ! -f "$WORKFLOW_FOUND" ]; then
    echo "❌ Error: Workflow file not found: $SPECIFIC_WORKFLOW"
    echo "   Available workflows:"
    find_workflows | while read -r wf; do
      echo "     - $wf"
    done
    exit 1
  fi
  WORKFLOWS=("$WORKFLOW_FOUND")
else
  # Get all workflow files
  mapfile -t WORKFLOWS < <(find_workflows)
fi

if [ ${#WORKFLOWS[@]} -eq 0 ]; then
  echo "❌ Error: No workflow files found in examples directories"
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

