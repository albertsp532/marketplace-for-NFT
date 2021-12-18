#!/usr/bin/env bash

if [ "$SOLIDITY_COVERAGE" = true ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
fi

echo "script dir $SCRIPT_DIR root dir $ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

trf="node ${ROOT_DIR}/node_modules/.bin/truffle"

${ROOT_DIR}/testrpc.sh >/dev/null 2>&1 &

if [[ "$1" != "--no-compile" ]]; then
    echo "Running truffle compile"
    ${trf} compile --network development --optimize ${ROOT_DIR}/contracts/
else
    shift
fi

if [ -d "$@" ]; then
  TESTS=($(/usr/bin/find $@ -name "*.test.js" -print | sort))
else
  TESTS=($@)
fi

for TEST_FILE in ${TESTS[@]} ; do
  if [[ ${TEST_FILE} != ${TESTS[0]} ]]; then
    echo "Running test RPC from  ${ROOT_DIR}/testrpc.sh"
    ${ROOT_DIR}/testrpc.sh >/dev/null 2>&1 &
  fi

  ${trf} test --network development ${TEST_FILE}
  RESULT=$?

  pgrep -f "node_modules/.bin/testrpc" | xargs kill -9

  if [ ${RESULT} -eq 0 ]; then
    printf "${GREEN}\xE2\x9C\x94 $TEST_FILE${NC}\n"
  else
    printf "${RED}\xE2\x9D\x8C $TEST_FILE${NC}\n"
  fi

done


exit ${RESULT}

