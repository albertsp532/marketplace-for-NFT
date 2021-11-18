//export const RPC_URL = 'https://web3-rpc-dev.uniqx.io';
export const RPC_URL = 'http://localhost:8545';

export let ac = {
	DEPLOY_OPERATOR:'0x00970e2f943e0ce7e40f86968cbdc08394543278',
	MARKET_ADMIN: '0x00ef8F67416B1704bBf2Fd525acd2AFfCc35c57e',
	MARKET_FEES: '0x00ef8F67416B1704bBf2Fd525acd2AFfCc35c57e',
	ADAPT_ADMIN: '0x009aedbd61db3198de2a06746be7427cf641f7b2',
};

export const ContractAdaptToken = {
	address: '0x14527183CE40AaF0A5420c1a25b73c16BCE5895A',
	json: require('../build/contracts/Collectibles.json'),
};

export const ContractUniqxMarketAdapt = {
	address: '0x26018084080A9A9de808f12BCcab9860e0B17121',
	json: require('../build/contracts/UniqxMarketAdapt.json'),
};
