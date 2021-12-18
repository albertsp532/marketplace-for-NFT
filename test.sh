#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

if [ "$SOLIDITY_COVERAGE" = true ]; then
  ganache_port=8555
else
  ganache_port=8545
fi

ganache_running() {
  nc -z localhost "$ganache_port"
}

start_ganache() {
  # We define 10 accounts with balance 1M ether, needed for high-value tests.
  local accounts=(
    --account="0x2ad3f76904f48230b7ff160076332dc9f14a737036886758bcec129969640269,1000000000000000000000000"
    --account="0x068d3e1d77f8b723d13ffe7ff40dc809bf27914f028fb10d959ee282b18084e1,1000000000000000000000000"
    --account="0x301954e37e87530fd1183c6342d80788b49d224a7a8d9f891d47cdd39639d573,1000000000000000000000000"
    --account="0x3a09c859a14bf4d83785bcd499229f864dcc3efbc8b816ef1216f75057c88360,1000000000000000000000000"
    --account="0x82090e9e39f12be355a048094f4d592435276dd7cb87b248b40aa0851c99ef88,1000000000000000000000000"
    --account="0x3b0376691692b646656e57e3867570c05ccfe54ab5ea96d9f607a370f2e01fc2,1000000000000000000000000"
    --account="0xbc21bf0ed06840b0e4be195b6cc0111814f756a61a16e421dfd5052bb1d79fe1,1000000000000000000000000"
    --account="0xe611511654c1747f35a8754085d9076a2247d7eb1045888ca6c5143c326ee7ae,1000000000000000000000000"
    --account="0xab6ded21e0dcc24adf33cb28fa3cc5921f796fd6eed67cdc47c20f7f2fac1035,1000000000000000000000000"
    --account="0x0ce634edd76471d0225dd156dd357f85c3243a0e8fabde5d8923dbfb0c08acd3,1000000000000000000000000"
    --account="0xb07ee1dec695b8d2f55d44bd735b8c6b561bfe890440fc1f64ce386b0aa6abb4,1000000000000000000000000"
    --account="0x6ffd209b0148e96c6024a8ec8725eec466081b38e0f501731c62b5589a9241cc,1000000000000000000000000"
    --account="0x09a3e1a17135545103354f6e63f0d2d2d51de59ed42a2ef7f8117ecadaabda0c,1000000000000000000000000"
    --account="0x77fd8f867e31f9866f0105c382e93ae47b738be371f0518b219af700f66a0a2d,1000000000000000000000000"
    --account="0x0ac999de816e1d705e96ded957fec9142e340aad5eefa0fcb162c832941883fd,1000000000000000000000000"
    --account="0x21c097e9320bd32ba710c0a30477f71b806a8a4684c86ddabde5121b4bf0052d,1000000000000000000000000"
    --account="0x0ada5812a223038a6e6a0816b8d065dc5c9504c22125bda93e00987dccc9eab6,1000000000000000000000000"
    --account="0x59946904bc5d31937e73c24df05291858832bb023df82a3d56a99b6d29bf99cd,1000000000000000000000000"
    --account="0xd3107be457fe1deaa6f6f32fbae8b13ed29299fcd97b5a337a08e2135e8b6b47,1000000000000000000000000"
    --account="0x693bd02e7cd6ed7e6f6a2922bbceb5ac91a0d31057af7cf2601fc72fdce8e570,1000000000000000000000000"
    --account="0x0f0b2aa6df3c5edef5449e1e69df336b02d62a681a2353db6f08e9fa07c303cf,1000000000000000000000000"
    --account="0xd3a689ea03aaf9a255512da0f2b310beaaac5c250726ae1606b81c5cc1ca772e,1000000000000000000000000"
    --account="0x5cff1fd1665483be57923ea3babdaa2473fff6d72fdf1dfc341a81614cc76aa7,1000000000000000000000000"
    --account="0x95d8fbf1b1bc6869aaf3c8d320c6bf23cdb705c1a92bb3f2af435ecc1653fa9d,1000000000000000000000000"
    --account="0x0d4e76f2f539970a6db70aff24678c393fe99cea65144411305c4351d2bca0fc,1000000000000000000000000"
    --account="0xbcdd4bc75b5e02dfb29e958165b285f18afca3afda39b4944b08e8bc87a95d12,1000000000000000000000000"
    --account="0xde81a985111f0f142170c604fb56afc3b1231fd5479dfd93fd7d621430a7cf9b,1000000000000000000000000"
    --account="0xec4575bb3e8caf27e995980422fa9a0e5e1ccb80318bda56e358e04468469cc1,1000000000000000000000000"
    --account="0xc963f55e43ef214a4784e75690e0f02a4e446982f6c663bd4e61741d91d76690,1000000000000000000000000"
  )

  if [ "$SOLIDITY_COVERAGE" = true ]; then
    node_modules/.bin/testrpc-sc --gasLimit 0xfffffffffff --port "$ganache_port" "${accounts[@]}" > /dev/null &
  else
    node_modules/.bin/ganache-cli --gasLimit 0xfffffffffff "${accounts[@]}" > /dev/null &
  fi

  ganache_pid=$!
}

if ganache_running; then
  echo "Using existing ganache instance"
else
  echo "Starting our own ganache instance"
  start_ganache
fi

if [ "$SOLIDITY_COVERAGE" = true ]; then
  node_modules/.bin/solidity-coverage

  if [ "$CONTINUOUS_INTEGRATION" = true ]; then
    cat coverage/lcov.info | node_modules/.bin/coveralls
  fi
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT_DIR="${SCRIPT_DIR}"

  ${ROOT_DIR}/test/run-all-tests.sh
fi
