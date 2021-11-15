import {
	accounts, assert, should, BigNumber, Bluebird
} from './common/common';
import ether from "./helpers/ether";

const UniqxMarketAdapt = artifacts.require("../contracts/UniqxMarketAdapt.sol");
const AdaptToken = artifacts.require("../adapt/contracts/AdaptCollectibles.sol");

contract('estimate gas - ', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);
	let adapt, market;
	const tokesCount = 10;

	it('should be able to deploy the smart contracts', async () => {

		adapt = await AdaptToken.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("ADAPT successfully deployed at address " + adapt.address);

		market = await UniqxMarketAdapt.new(
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

		let rec = await market.make(
			tokens,
			prices,
			reservations,
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log('Publish complete - Gas Used = ' + rec.receipt.gasUsed);

		let tokenStatus = await market.getOrderStatus(tokens[0]);

		console.log('token status ', JSON.stringify(tokenStatus));
	})
});


