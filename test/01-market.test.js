import {
	accounts
} from './common/common';

const BigNumber = web3.BigNumber;
let assert = require('chai').assert;
const should = require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

let Promise = require('bluebird');

const Market = artifacts.require("../contracts/Market.sol");

contract('Market - testing the constructor', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);

	it('should be able to deploy the Market contract', async function () {

		let market = await Market.new(
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("token successfully deployed at address " + market.address);
	});
});


