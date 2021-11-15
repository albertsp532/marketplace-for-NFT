//export const RPC_URL = 'https://web3-rpc-dev.uniqx.io';
export const RPC_URL = 'http://localhost:8545';

export let ac = {
	DEPLOY_OPERATOR:'0x00970e2f943e0ce7e40f86968cbdc08394543278',
	MARKET_ADMIN: '0x00ef8F67416B1704bBf2Fd525acd2AFfCc35c57e',
	MARKET_FEES: '0x00ef8F67416B1704bBf2Fd525acd2AFfCc35c57e',
	ADAPT_ADMIN: '0x009aedbd61db3198de2a06746be7427cf641f7b2',
};

export const ContractAdaptToken = {
	address: '0x4B7cf561861Ea2Ba9508438bD79C41681F4Ef280',
	json: require('../build/contracts/Collectibles.json'),
};

export const ContractUniqxMarketAdapt = {
	address: '0x3FFD5167D95022CC791FeffcA24B9a5d00f17aa1',
	json: require('../build/contracts/UniqxMarketAdapt.json'),
};
