#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"

trf="node ${ROOT_DIR}/node_modules/.bin/truffle"

printf "${GREEN}Running truffle compile${NC}\n"
${trf} compile --network development --optimize $@
