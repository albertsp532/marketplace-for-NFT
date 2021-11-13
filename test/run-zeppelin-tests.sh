#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

MOCKS_SOL="${ROOT_DIR}/contracts/MockInclude.sol"
MOCKS_BAK="${ROOT_DIR}/contracts/MockInclude.sol.bak"
if [ -f ${MOCKS_BAK} ]; then
	mv ${MOCKS_BAK} ${MOCKS_SOL}
fi

declare -a ZEPPELIN_TESTS=(
"${ROOT_DIR}/zeppelin/test/ownership/Ownable.test.js"
# "${ROOT_DIR}/zeppelin/test/ownership/HasNoEther.test.js"
"${ROOT_DIR}/zeppelin/test/ownership/HasNoTokens.test.js"
"${ROOT_DIR}/zeppelin/test/ownership/HasNoContracts.test.js"
"${ROOT_DIR}/zeppelin/test/lifecycle/Pausable.test.js"
"${ROOT_DIR}/zeppelin/test/math/SafeMath.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/SafeERC20.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/BasicToken.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/StandardToken.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/PausableToken.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/DetailedERC20.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/CappedToken.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/TokenTimelock.test.js"
"${ROOT_DIR}/zeppelin/test/token/ERC20/BurnableToken.test.js"
)

${ROOT_DIR}/compile.sh

RESULT=0
for JS_FILE in ${ZEPPELIN_TESTS[@]} ; do
    opts=--no-compile
    if [[ JS_FILE = ${ZEPPELIN_TESTS[0]} ]]; then
        unset opts
    fi

	if [ ${RESULT} -eq 0 ]; then
		TEST_PATH=${JS_FILE}
		printf "${GREEN}Testing: ${TEST_PATH}${NC}\n"
		./z.sh ${opts} ${TEST_PATH}
		RESULT=$?
	fi
done

if [ ${RESULT} -eq 0 ]; then
  printf "${GREEN}\xE2\x9C\x94 "`pwd`"/run-zeppelin-tests.sh${NC}\n"
else
  printf "${RED}\xE2\x9D\x8C "`pwd`"/run-zeppelin-tests.sh${NC}\n"
fi

exit ${RESULT}
