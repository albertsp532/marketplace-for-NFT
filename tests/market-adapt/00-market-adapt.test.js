import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";

const MarketAdapt = artifacts.require("../../../contracts/MarketAdapt.sol");
const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('estimate gas - ', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);
	let adapt, market;
	const tokesCount = 10;

	it('should be able to deploy the smart contracts', async () => {

		adapt = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("ADAPT successfully deployed at address " + adapt.address);

		market = await MarketAdapt.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			adapt.address,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to mass mint adapt tokens', async function () {
		let rec = await adapt.massMint(
			ac.ADAPT_ADMIN,
			'123',       // json hash
			0,                  // start
			tokesCount,         // count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
		console.log('Minting complete - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to publish multiple tokens in one transaction', async () => {

		let tokens = [];
		let prices = [];
		let reservations = [];

		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await adapt.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
			reservations[i] = 0x0;
		}

		// approve market to transfer all adapt tokens hold by adapt admin
		await adapt.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		let rec = await market.createMany(
			tokens,
			prices,
			reservations,
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log('Publish complete - Gas Used = ' + rec.receipt.gasUsed);

		let orderStatus = await market.getOrderStatus(tokens[0]);
		console.log('Order status: ', orderStatus);

	});

	it('BUYER1 should be able to donate more than is required and take the first token', async function () {

		const tokenId = await adapt.tokenByIndex(0);

		let result = await market.buy(tokenId, { from: ac.BUYER1 , value: ether(1.1), gas: 7000000 }).should.be.fulfilled;

		console.log('Take order completed! Gas used: ' + result.receipt.gasUsed);

		// order status should be Sold
		//const orderStatus = await market.getOrderStatus(tokenId);
		//console.log('Order status: ', JSON.stringify(orderStatus));
		//assert.equal(orderStatus, OrderStatus.Sold, 'The order status should be \'Sold\' now');

		//const orderInfo = await market.getOrderInfo(tokenId);
		//console.log('order info:', JSON.stringify(orderInfo));
		//orderInfo[3].should.be.bignumber.equal(ether(1.1));
		//orderInfo[4].should.be.bignumber.greaterThan(0);

		// BUYER1 should own the token now
		const owner = await adapt.ownerOf(tokenId);
		console.log('owner: ', owner);
		console.log('BUYER1: ', ac.BUYER1);
	});
});


