// Returns the time of the last mined block in seconds
export default function latestTime () {
  const block =  web3.eth.getBlock('latest');
  return block.timestamp;
}
