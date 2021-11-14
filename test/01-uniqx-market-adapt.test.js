
import {
	accounts, assert, should, BigNumber, Bluebird
} from './common/common';
import ether from "./helpers/ether";
import wei from "./helpers/wei";


const UniqxMarketAdapt = artifacts.require("../contracts/UniqxMarketAdapt.sol");
const AdaptToken = artifacts.require("../adapt/contracts/Collectibles.sol");

contract('Market - a simple walk-through the functionality', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);
	let adapt, market;

	let token1, token2;

	let pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	let pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

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

	it('should be able to mint some tokens in ADAPT', async () => {

		await adapt.massMint(
			ac.ADAPT_ADMIN,
			'0xabcd',
			1,
			2,
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		await adapt.massMint(
			ac.ADAPT_ADMIN,
			'0xef01',
			1,
			2,
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		let balance = await adapt.balanceOf(ac.ADAPT_ADMIN);
		console.log(ac.ADAPT_ADMIN, 'balance= ', balance.toString(10));

		token1 = await adapt.tokenByIndex(0);
		token2 = await adapt.tokenByIndex(2);

		console.log('token1', token1.toString(16));
		console.log('token2', token2.toString(16));
	})

	it('should be able permission the market for all items in ADAPT', async () => {
		await adapt.setApprovalForAll(
			market.address,
			true,
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;
	})

	it('should be able to publish a token to the market', async () => {

		let rec = await market.publish(
			[token1, token2],
			[ether(1), ether(2)],
			[0x0, 0x0],
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;
		// console.log(JSON.stringify(rec.logs, null, 2));

		let ownerToken1 = await adapt.ownerOf(token1);
		assert.equal(ownerToken1, market.address, 'MARKET should tmp own the token');
	})

	it('should be able to fulfill a valid acquire request', async () => {

		let balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		let rec = await market.acquire(
			token1,
			{from: ac.BUYER1, value: ether(1)}
		).should.be.fulfilled;

		let ownerToken1 = await adapt.ownerOf(token1);
		assert.equal(ownerToken1, ac.BUYER1, 'BUYER1 should now be the owner of token1');

		let balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		let marketFeesShouldBe = ether(1).mul(4).div(100);
		let marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		let sellerFeesShouldBe = ether(1).sub(marketFeesShouldBe);
		let sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	})

	it('should be able to cancel a published token from the market', async () => {

		let ownerToken2 = await adapt.ownerOf(token2);
		assert.equal(ownerToken2, market.address, 'MARKET should tmp own the token');

		let rec = await market.cancel(
			[token2],
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		ownerToken2 = await adapt.ownerOf(token2);
		assert.equal(ownerToken2, ac.ADAPT_ADMIN, 'ADAPT_ADMIN should now own the item');
	})
});


