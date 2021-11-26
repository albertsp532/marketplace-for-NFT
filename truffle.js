require('babel-register');
require('babel-polyfill');


module.exports = {
	networks: {
		development: {
			host: 'localhost',
			port: 8545,
			network_id: '*',
		},
	},

	mocha: {
		reporter: 'eth-gas-reporter',
		reporterOptions : {
			currency: 'USD',
			gasPrice: 21
		}
	},

	solc: {
		optimizer: {
			enabled: true,
			runs: 200
		}
	}
};
