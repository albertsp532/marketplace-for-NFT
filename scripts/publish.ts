import * as Contract from 'truffle-contract';
import * as vars from './common';
import * as BigNumber from 'bignumber.js';
import * as Web3 from 'web3';

const ProviderEngine = require('web3-provider-engine');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
const WalletSubprovider = require('ethereumjs-wallet/provider-engine');
const Wallet = require('ethereumjs-wallet');

const wallet = Wallet.fromV3(require('./keys/adapt-admin.json'), '123456789');
console.log('Address:', wallet.getAddressString());

const engine = new ProviderEngine();
const web3 = new Web3(engine);
engine.addProvider(new RpcSubprovider({rpcUrl: vars.RPC_URL}));
engine.addProvider(new WalletSubprovider(wallet, {}));
engine.start();

async function publish() {

	let UniqxMarketAdapt = Contract(vars.ContractUniqxMarketAdapt.json);
	UniqxMarketAdapt.setProvider(web3.currentProvider);

	let market = await UniqxMarketAdapt.at(vars.ContractUniqxMarketAdapt.address);

	let tokens = [new BigNumber('d02fd48d7070895525edc1a91394cc9b1498d88aad76dc2ab4a4166b479c947', 16)];
	let prices = [10000];
	let reservations = [0x0];

	console.log('tokens ', tokens);

	let rec = await market.publish(
		tokens,
		prices,
		reservations,
		{ from: vars.ac.ADAPT_ADMIN , gas: 4000000 }
	);

	console.log('Publish Complete!\n', JSON.stringify(rec.logs, null, '\t'));
}

publish().then();
