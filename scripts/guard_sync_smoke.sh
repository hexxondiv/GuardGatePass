#!/usr/bin/env bash
# Workstream 7 manual check against local gatepass-api (ngrok or LAN).
# 1) Log in as guard/estate_admin with estate scope; copy JWT.
# 2) export GPS_JWT="..." GPS_ESTATE_ID="123" GPS_DEVICE_ID="test_device_smoke"
# 3) ./scripts/guard_sync_smoke.sh
set -euo pipefail
BASE="${GPS_API_BASE:-http://127.0.0.1:8001/api/v1}"
JWT="${GPS_JWT:?set GPS_JWT}"
ESTATE="${GPS_ESTATE_ID:?set GPS_ESTATE_ID}"
DEV="${GPS_DEVICE_ID:?set GPS_DEVICE_ID}"

hdr=(-H "Authorization: Bearer ${JWT}" -H "X-Estate-Id: ${ESTATE}" -H "Content-Type: application/json")
if [[ "${BASE}" == *"ngrok"* ]]; then
  hdr+=(-H "ngrok-skip-browser-warning: true")
fi

echo "== POST /guard-devices/register =="
curl -sS "${hdr[@]}" -X POST "${BASE}/guard-devices/register" \
  -d "{\"device_id\":\"${DEV}\",\"platform\":\"smoke\",\"app_version\":\"0\"}" | head -c 400
echo ""

echo "== GET /guard-sync/bootstrap =="
curl -sS "${hdr[@]}" "${BASE}/guard-sync/bootstrap?device_id=${DEV}&near_expiry_window_minutes=360" | head -c 600
echo ""

IDEM="$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
echo "== POST /guard-sync/events (idempotency_key=${IDEM}) =="
curl -sS "${hdr[@]}" -X POST "${BASE}/guard-sync/events" \
  -d "{\"device_id\":\"${DEV}\",\"events\":[{\"idempotency_key\":\"${IDEM}\",\"access_code\":999999,\"event_type\":\"check_in\",\"event_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"verification_mode\":\"access_code\"}]}" | head -c 800
echo ""

echo "== Replay same idempotency_key (expect duplicate handling) =="
curl -sS "${hdr[@]}" -X POST "${BASE}/guard-sync/events" \
  -d "{\"device_id\":\"${DEV}\",\"events\":[{\"idempotency_key\":\"${IDEM}\",\"access_code\":999999,\"event_type\":\"check_in\",\"event_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"verification_mode\":\"access_code\"}]}" | head -c 800
echo ""
echo "Done."
