#!/usr/bin/env bash
export PATH=/Users/teerakanok/.nvm/versions/node/v24.18.0/bin:$PATH
cd /Users/teerakanok/Dev/continuations/academy-first-launch-host-verify/academy-web
L=/Users/teerakanok/.local/state/cyberskills/gathering-academy-first-launch/evidence/predeploy-cfa59b4
mkdir -p $L
[ -d node_modules/.bin ] || npm ci --no-audit --no-fund > $L/npm-ci.log 2>&1; echo "npm-ci ok" | tee $L/summary.txt
./node_modules/.bin/vitest run --project unit > $L/unit.log 2>&1; echo "unit exit=$? $(grep -E 'Tests +[0-9]' $L/unit.log | tail -1)" | tee -a $L/summary.txt
./node_modules/.bin/tsc --noEmit > $L/tsc-app.log 2>&1; echo "tsc-app exit=$?" | tee -a $L/summary.txt
./node_modules/.bin/tsc -p tsconfig.worker.json > $L/tsc-worker.log 2>&1; echo "tsc-worker exit=$?" | tee -a $L/summary.txt
npm run build:cf > $L/build-cf.log 2>&1; echo "build:cf exit=$?" | tee -a $L/summary.txt
echo DONE >> $L/summary.txt
