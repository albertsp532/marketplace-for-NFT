
const moment = require('moment');

export function accounts(rpc_accounts) {
	return {
		OPERATOR: rpc_accounts[0],
		MARKET_ADMIN_MSIG: rpc_accounts[1],
		MARKET_FEES_MSIG: rpc_accounts[2],

		ADAPT_OWNER: rpc_accounts[3],
		ADAPT_ADMIN: rpc_accounts[4],
		BUYER1: rpc_accounts[5],
		BUYER2: rpc_accounts[6],
		ACCOUNT1: rpc_accounts[7],
		ACCOUNT2: rpc_accounts[8],
		ACCOUNT3: rpc_accounts[9],
		BUYER3: rpc_accounts[10]
	};
}

export function printTime(timestamp) {
	console.log('Timestamp is: ', JSON.stringify(timestamp));
	console.log('Time is: ', moment.unix(timestamp).utc().format());
}

const Bluebird = require('bluebird');
const BigNumber = web3.BigNumber;
const assert = require('chai').assert;
const should = require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();


const OrderStatus = {
	Unknown: 0,
	Published: 1,
	Cancelled: 2,
	Acquired: 3,
	Reserved: 4,
};


module.exports = {
	accounts: accounts,
	BigNumber: BigNumber,
	Bluebird: Bluebird,
	assert: assert,
	should: should,
	OrderStatus: OrderStatus,
};
