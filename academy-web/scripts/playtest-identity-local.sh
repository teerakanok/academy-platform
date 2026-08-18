#!/bin/bash
set -euo pipefail

ACADEMY_WEB="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ACADEMY_WEB/.." && pwd)"
IDENTITY_ROOT="$REPO_ROOT/../identity-control"

if [[ ! -d "$IDENTITY_ROOT" ]]; then
  echo "ไม่พบ Identity Control ที่ $IDENTITY_ROOT" >&2
  echo "กรุณาวาง identity-control ไว้เป็น sibling directory ของ Academy repo ก่อนเริ่ม playtest" >&2
  exit 1
fi

IDENTITY_ROOT="$(cd "$IDENTITY_ROOT" && pwd)"

MODE="${MODE:-}"
if [[ "${1:-}" != "" ]]; then
  MODE="$1"
fi

case "$MODE" in
  ""|play|check) ;;
  *)
    echo "การใช้งาน: $0 [check]" >&2
    exit 2
    ;;
esac

if ! command -v lsof >/dev/null 2>&1; then
  echo "ต้องมีคำสั่ง lsof สำหรับตรวจสอบพอร์ต" >&2
  exit 1
fi
if ! command -v nc >/dev/null 2>&1; then
  echo "ต้องมีคำสั่ง nc สำหรับรอ service พร้อมใช้งาน" >&2
  exit 1
fi

for port in 8788 5173 3000; do
  port_pids="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN || true)"
  if [[ -n "$port_pids" ]]; then
    echo "พอร์ต $port ถูกใช้อยู่โดย PID: $(echo "$port_pids" | tr "\n" " ")" >&2
    echo "ปิด process ก่อนด้วย: kill $port_pids" >&2
    echo "หรือตรวจสอบด้วย: lsof -nP -iTCP:$port -sTCP:LISTEN" >&2
    exit 1
  fi
done

LOG_DIR="$ACADEMY_WEB/.local/playtest-logs"
mkdir -p "$LOG_DIR"

pids=()
names=()

cleanup() {
  exit_code="$1"
  trap - EXIT INT TERM

  for pid in "${pids[@]}"; do
    kill -TERM "-$pid" >/dev/null 2>&1 || kill -TERM "$pid" >/dev/null 2>&1 || true
  done


  sleep 2

  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "-$pid" >/dev/null 2>&1 || kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done

  for pid in "${pids[@]}"; do
    wait "$pid" >/dev/null 2>&1 || true
  done

  echo "ปิดทุก service ของ playtest เรียบร้อยแล้ว"
  exit "$exit_code"
}

trap "cleanup \$?" EXIT
trap "cleanup 130" INT
trap "cleanup 143" TERM

start_service() {
  name="$1"
  working_directory="$2"
  shift 2

  log_file="$LOG_DIR/$name.log"
  : >"$log_file"

  set -m
  (
    cd "$working_directory"
    exec "$@"
  ) >"$log_file" 2>&1 &
  service_pid="$!"
  set +m

  pids+=("$service_pid")
  names+=("$name")
  echo "กำลังเริ่ม $name (PID $service_pid) → $log_file"
}

wait_for_service() {
  name="$1"
  pid="$2"
  port="$3"
  log_file="$LOG_DIR/$name.log"

  for _ in $(seq 1 60); do
    if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
      echo "$name พร้อมใช้งานที่พอร์ต $port"
      return 0
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "$1 ไม่พร้อมใช้งานภายใน 60 วินาที (พอร์ต $port)" >&2
  echo "--- ท้าย log ของ $1 ---" >&2
  tail -n 80 "$log_file" >&2 || true
  cleanup 1
}

start_service "control-api" "$IDENTITY_ROOT" \
  npm run dev --workspace apps/control-api
wait_for_service "control-api" "${pids[0]}" 8788

start_service "account-center" "$IDENTITY_ROOT" \
  npm run dev --workspace apps/account-center
wait_for_service "account-center" "${pids[1]}" 5173

start_service "academy" "$ACADEMY_WEB" \
  env \
    ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE=1 \
    ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN=http://localhost:3000 \
    ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN=http://localhost:5173 \
    npm run dev
wait_for_service "academy" "${pids[2]}" 3000

# next dev compile route ตอน request แรก (ช้ากว่า timeout ของ journey spec) —
# อุ่น route สำคัญให้ compile เสร็จก่อนใช้งาน/ทดสอบ; 4xx ระหว่างอุ่นเป็นเรื่องปกติ
echo "กำลังอุ่น route ของ Academy (next dev compile ครั้งแรกช้า)..."
echo "warm sign-in: $(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000/sign-in?next=%2Fdashboard" || echo FAIL)"
echo "warm dashboard: $(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000/dashboard" || echo FAIL)"
echo "warm auth-me: $(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000/api/auth/me" || echo FAIL)"
echo "warm progress: $(curl -s -o /dev/null -w "%{http_code}" --max-time 120 "http://localhost:3000/api/progress" || echo FAIL)"
echo "warm courses: $(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000/courses" || echo FAIL)"
curl -s -o /dev/null --max-time 60 -X POST -H "Origin: http://localhost:3000" \
  "http://localhost:3000/api/auth/identity/start" || true
curl -s -o /dev/null --max-time 60 "http://localhost:3000/auth/callback" || true
echo "อุ่น route เสร็จแล้ว"

echo
echo "========================================"
echo "Academy × Identity Control playtest พร้อมแล้ว"
echo "เปิด: http://localhost:3000/sign-in?next=%2Fdashboard"
echo "รหัส sign-in ของ local fixture: 123456"
echo "logs: $LOG_DIR"
echo "กด Ctrl+C เพื่อปิดทุกอย่าง"
echo "========================================"
echo

if [[ "$MODE" == "check" ]]; then
  check_status=0
  (
    cd "$ACADEMY_WEB"
    npx playwright test --config=playwright.identity-local.config.ts
  ) || check_status="$?"
  exit "$check_status"
fi

while kill -0 "${pids[0]}" >/dev/null 2>&1 && \
  kill -0 "${pids[1]}" >/dev/null 2>&1 && \
  kill -0 "${pids[2]}" >/dev/null 2>&1; do
  sleep 1
done

echo "มี service หยุดทำงานก่อนปิด playtest" >&2
cleanup 1
