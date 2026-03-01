#!/bin/bash

# =============================================================================
# Store APNs credentials in AWS SSM Parameter Store
# =============================================================================
# Required env vars:
#   APNS_KEY_ID
#   APNS_TEAM_ID
#   APNS_BUNDLE_ID
# One of:
#   APNS_PRIVATE_KEY
#   APNS_PRIVATE_KEY_FILE
#   APNS_PRIVATE_KEY_BASE64
#
# Optional:
#   AWS_REGION (default: us-east-1)
#   APNS_SSM_PREFIX (default: /handycall/apns)
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PREFIX="${APNS_SSM_PREFIX:-/handycall/apns}"

if [[ -z "${APNS_KEY_ID:-}" || -z "${APNS_TEAM_ID:-}" || -z "${APNS_BUNDLE_ID:-}" ]]; then
  echo "Error: APNS_KEY_ID, APNS_TEAM_ID, and APNS_BUNDLE_ID are required."
  exit 1
fi

PRIVATE_KEY_VALUE=""
if [[ -n "${APNS_PRIVATE_KEY:-}" ]]; then
  PRIVATE_KEY_VALUE="${APNS_PRIVATE_KEY}"
elif [[ -n "${APNS_PRIVATE_KEY_FILE:-}" ]]; then
  if [[ ! -f "${APNS_PRIVATE_KEY_FILE}" ]]; then
    echo "Error: APNS_PRIVATE_KEY_FILE does not exist: ${APNS_PRIVATE_KEY_FILE}"
    exit 1
  fi
  PRIVATE_KEY_VALUE="$(cat "${APNS_PRIVATE_KEY_FILE}")"
elif [[ -n "${APNS_PRIVATE_KEY_BASE64:-}" ]]; then
  if ! PRIVATE_KEY_VALUE="$(printf '%s' "${APNS_PRIVATE_KEY_BASE64}" | base64 -d 2>/dev/null)"; then
    echo "Error: APNS_PRIVATE_KEY_BASE64 is not valid base64."
    exit 1
  fi
else
  echo "Error: provide APNS_PRIVATE_KEY, APNS_PRIVATE_KEY_FILE, or APNS_PRIVATE_KEY_BASE64."
  exit 1
fi

echo "Writing APNs parameters to SSM in ${REGION} under prefix ${PREFIX} ..."

aws ssm put-parameter \
  --name "${PREFIX}/key-id" \
  --type "String" \
  --overwrite \
  --region "${REGION}" \
  --value "${APNS_KEY_ID}" >/dev/null

aws ssm put-parameter \
  --name "${PREFIX}/team-id" \
  --type "String" \
  --overwrite \
  --region "${REGION}" \
  --value "${APNS_TEAM_ID}" >/dev/null

aws ssm put-parameter \
  --name "${PREFIX}/bundle-id" \
  --type "String" \
  --overwrite \
  --region "${REGION}" \
  --value "${APNS_BUNDLE_ID}" >/dev/null

aws ssm put-parameter \
  --name "${PREFIX}/private-key" \
  --type "SecureString" \
  --overwrite \
  --region "${REGION}" \
  --value "${PRIVATE_KEY_VALUE}" >/dev/null

echo "Done. Parameters written:"
echo "  ${PREFIX}/key-id"
echo "  ${PREFIX}/team-id"
echo "  ${PREFIX}/bundle-id"
echo "  ${PREFIX}/private-key"
