#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

declare -a TEST_SUITE=(
"run-project-tests.sh"
#"run-zeppelin-tests.sh"
)

RESULT=0
for TEST_RUN in ${TEST_SUITE[@]} ; do
	if [ ${RESULT} -eq 0 ]; then
		TEST_PATH=${SCRIPT_DIR}/${TEST_RUN}
		printf "${GREEN}Running: ${TEST_PATH}${NC}\n"

		bash ${TEST_PATH}
		RESULT=$?
	fi
done

if [ ${RESULT} -eq 0 ]; then
  printf "${GREEN}\xE2\x9C\x94 "`pwd`"/run-all-tests.sh${NC}\n"
else
  printf "${RED}\xE2\x9D\x8C "`pwd`"/run-all-tests.sh${NC}\n"
fi

exit ${RESULT}
