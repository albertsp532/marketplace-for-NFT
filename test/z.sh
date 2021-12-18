#!/usr/bin/env bash


if [ "$SOLIDITY_COVERAGE" = true ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

ROOT_DIR="${SCRIPT_DIR}/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

MOCKS_SOL="${ROOT_DIR}/contracts/MockInclude.sol"
MOCKS_BAK="${ROOT_DIR}/contracts/MockInclude.sol.bak"
if [ -f ${MOCKS_BAK} ]; then
	mv ${MOCKS_BAK} ${MOCKS_SOL}
fi

trf="node ${ROOT_DIR}/node_modules/.bin/truffle"

${ROOT_DIR}/testrpc.sh >/dev/null 2>&1 &

if [[ "$1" != "--no-compile" ]]; then
    echo "Running truffle compile"
    ${trf} compile --network development --optimize ${ROOT_DIR}/contracts/
else
    shift
fi

${trf} test $@
RESULT=$?

pgrep -f "node_modules/.bin/testrpc" | xargs kill -9

if [ ${RESULT} -eq 0 ]; then
  printf "${GREEN}\xE2\x9C\x94 $@${NC}\n"
else
  printf "${RED}\xE2\x9D\x8C $@${NC}\n"
fi

exit ${RESULT}

