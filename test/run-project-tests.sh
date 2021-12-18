#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

PROJECT_TESTS=($(/usr/bin/find ${SCRIPT_DIR} -name "*.test.js" -print | sort))

RESULT=0
for TEST_FILE in ${PROJECT_TESTS[@]} ; do
    opts=--no-compile
    if [[ ${TEST_FILE} = ${PROJECT_TESTS[0]} ]]; then
        unset opts
    fi

	if [ ${RESULT} -eq 0 ]; then
		printf "${GREEN}Testing: ${TEST_FILE}${NC}\n"
		${SCRIPT_DIR}/p.sh ${opts} ${TEST_FILE}
		RESULT=$?
	fi
done

if [ ${RESULT} -eq 0 ]; then
  printf "${GREEN}\xE2\x9C\x94 ${SCRIPT_DIR}/run-project-tests.sh${NC}\n"
else
  printf "${RED}\xE2\x9D\x8C ${SCRIPT_DIR}/run-project-tests.sh${NC}\n"
fi

exit ${RESULT}
