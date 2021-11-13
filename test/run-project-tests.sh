#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

PROJECT_TESTS=($(/bin/ls ${SCRIPT_DIR}/*.js | sort))

MOCKS_SOL="${ROOT_DIR}/contracts/MockInclude.sol"
MOCKS_BAK="${ROOT_DIR}/contracts/MockInclude.sol.bak"
if [ -f ${MOCKS_SOL} ]; then
	mv ${MOCKS_SOL} ${MOCKS_BAK}
fi

RESULT=0
for TEST_FILE in ${PROJECT_TESTS[@]} ; do
    opts=--no-compile
    if [[ $TEST_FILE = ${PROJECT_TESTS[0]} ]]; then
        unset opts
    fi

	if [ ${RESULT} -eq 0 ]; then
		printf "${GREEN}Testing: ${TEST_FILE}${NC}\n"
		${SCRIPT_DIR}/p.sh ${opts} ${TEST_FILE}
		RESULT=$?
	fi
done

if [ -f ${MOCKS_BAK} ]; then
	mv ${MOCKS_BAK} ${MOCKS_SOL}
fi

if [ ${RESULT} -eq 0 ]; then
  printf "${GREEN}\xE2\x9C\x94 "`pwd`"/run-project-tests.sh${NC}\n"
else
  printf "${RED}\xE2\x9D\x8C "`pwd`"/run-project-tests.sh${NC}\n"
fi

exit ${RESULT}
