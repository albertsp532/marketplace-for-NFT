require('babel-register');
require('babel-polyfill');


module.exports = {
	networks: {
		development: {
			host: 'localhost',
			network_id: '*', // eslint-disable-line camelcase
			port: 8545,
			gas: 0xfffffffffff,
			gasPrice: 0x01,
		},
		coverage: {
			host: 'localhost',
			network_id: '*', // eslint-disable-line camelcase
			port: 8555,
			gas: 0xfffffffffff,
			gasPrice: 0x01,
		},
	},

	mocha: {
		reporter: 'eth-gas-reporter',
		reporterOptions : {
			currency: 'USD',
			gasPrice: 0x01
		}
	},

	solc: {
		optimizer: {
			enabled: true,
			runs: 200
		}
	},
};
