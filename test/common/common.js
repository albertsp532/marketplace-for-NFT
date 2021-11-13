require('babel-register');
require('babel-polyfill');

const moment = require('moment');

export function accounts(rpc_accounts) {
	return {
		ADMIN: rpc_accounts[0],
		OPERATOR: rpc_accounts[1],
		CHARITY_MSIG: rpc_accounts[2],
		INCENTIVES_MSIG: rpc_accounts[3],
		MANUAL_MSIG: rpc_accounts[4],
		SERVICE_ADDRESS1: rpc_accounts[5],
		SERVICE_ADDRESS2: rpc_accounts[6],
		AIRDROP1: rpc_accounts[7],
		AIRDROP2: rpc_accounts[8],
		ACCOUNT1: rpc_accounts[9],
		ACCOUNT2: rpc_accounts[10],
		ACCOUNT3: rpc_accounts[11],
	};
}

export function printTime(timestamp) {
	console.log('Timestamp is: ', JSON.stringify(timestamp));
	console.log('Time is: ', moment.unix(timestamp).utc().format());
}

module.exports = {
	accounts: accounts,
};
