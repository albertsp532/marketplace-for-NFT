import {
	accounts, assert, should, BigNumber, Bluebird
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const UniqxMarketAdapt = artifacts.require("../../../contracts/UniqxMarketAdapt.sol");
const AdaptToken = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('Market - a simple walk-through the functionality', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);
	let adapt, market;

	let tokesCount = 10;
	let tokens = [];
	let prices = [];
	let reservations = [];

	let pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	let pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the smart contracts', async () => {

		adapt = await AdaptToken.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("ADAPT successfully deployed at address " + adapt.address);

		market = await UniqxMarketAdapt.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			adapt.address,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to mint some tokens in ADAPT', async () => {

		await adapt.massMint(
			ac.ADAPT_ADMIN,
			'0xabcd',
			1,
			tokesCount,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await adapt.massMint(
			ac.ADAPT_ADMIN,
			'0xef01',
			1,
			tokesCount,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		let balance = await adapt.balanceOf(ac.ADAPT_ADMIN);
		console.log(ac.ADAPT_ADMIN, 'balance= ', balance.toString(10));


		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await adapt.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
			reservations[i] = 0x0;
		}
	});

	it('should be able permission the market for all items in ADAPT', async () => {

		await adapt.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to create an order on the market', async () => {

		const { logs }  = await market.listTokens(
			[ tokens[0], tokens[1], tokens[2] ],
			[ prices[0], prices[1], prices[2] ],
			[ reservations[0], reservations[1], reservations[2] ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;

		let ownerToken1 = await adapt.ownerOf(tokens[0]);
		assert.equal(ownerToken1, market.address, 'MARKET should tmp own the token');

		await expectEvent.inLogs(logs, 'LogTokensListed');
	});

	it('should be able to fulfill a valid take request', async () => {

		let balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		const { logs } = await market.buyTokens(
			[ tokens[0] ],
			{ from: ac.BUYER1, value: prices[0] }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokenSold');

		let ownerToken1 = await adapt.ownerOf(tokens[0]);
		assert.equal(ownerToken1, ac.BUYER1, 'BUYER1 should now be the owner of token1');

		let balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		let marketFeesShouldBe = prices[0].mul(4).div(100);
		let marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		let sellerFeesShouldBe = prices[0].sub(marketFeesShouldBe);
		let sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should be able to fulfill a valid take request with multiple tokens', async () => {

		let balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		const { logs } = await market.buyTokens(
			[ tokens[1], tokens[2] ],
			{ from: ac.BUYER1, value: ether(2) }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokenSold');

		let ownerToken1 = await adapt.ownerOf(tokens[1]);
		assert.equal(ownerToken1, ac.BUYER1, 'BUYER1 should now be the owner of token1');

		let ownerToken2 = await adapt.ownerOf(tokens[2]);
		assert.equal(ownerToken2, ac.BUYER1, 'BUYER1 should now be the owner of token2');

		let balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		let marketFeesShouldBe = ether(2).mul(4).div(100);
		let marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		let sellerFeesShouldBe = ether(2).sub(marketFeesShouldBe);
		let sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should not be able to take order if price is lower than the asked price', async () => {
		const { logs }  = await market.listTokens(
			[ tokens[3] ],
			[ prices[3] ],
			[ reservations[3] ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;

		await market.buyTokens(
			[ tokens[3] ],
			{ from: ac.BUYER1, value: ether(0.99) }
		).should.be.rejectedWith(EVMRevert);

		const tokenStatus = await market.getOrderStatus(tokens[3]);
		assert.equal(tokenStatus, 1, 'The order should remain in \'Listed\' state');
	});

	it('should not be able to take order if price is greater than the asked price', async () => {
		await market.buyTokens(
			[ tokens[3] ],
			{ from: ac.BUYER1, value: ether(1.1) }
		).should.be.rejectedWith(EVMRevert);

		const tokenStatus = await market.getOrderStatus(tokens[3]);
		assert.equal(tokenStatus, 1, 'The order should remain in \'Listed\' state');
		// MC: please use enums instead of constants like these!
	});

	it('should disallow to publish a token which was sold', async () => {
		await market.listTokens(
			[ tokens[0] ],
			[ ether(1.5) ],
			[ 0x0 ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to cancel a published token from the market', async () => {

		let ownerToken3 = await adapt.ownerOf(tokens[3]);
		assert.equal(ownerToken3, market.address, 'MARKET should tmp own the token');

		const { logs } = await market.cancelTokens(
			[ tokens[3] ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokensCancelled');

		ownerToken3 = await adapt.ownerOf(tokens[3]);
		assert.equal(ownerToken3, ac.ADAPT_ADMIN, 'ADAPT_ADMIN should now own the item');
	});

	it('should reject taking multiple orders if value is not enough', async () => {

		await market.listTokens(
			[ tokens[4], tokens[5] ],
			[ prices[4], prices[5] ],
			[ reservations[4], reservations[5] ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;

		const {logs} = await market.buyTokens(
			[ tokens[4], tokens[5] ],
			{ from: ac.BUYER1, value: ether(1.99) }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should return the token to the original owner(not the seller) on cancel', async () => {

		// approve ac.ACCOUNT3 to make transfers in the account of ac.ADAPT_ADMIN
		await adapt.setApprovalForAll(
			ac.ACCOUNT3,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await market.listTokens(
			[ tokens[6] ],
			[ prices[6] ],
			[ reservations[6] ],
			{ from: ac.ACCOUNT3 , gas: 7000000 }
		).should.be.fulfilled;

		let ownerToken = await adapt.ownerOf(tokens[6]);
		assert.equal(ownerToken, market.address, 'MARKET should tmp own the token');

		const { logs } = await market.cancelTokens(
			[ tokens[6] ],
			{ from: ac.ACCOUNT3 , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokensCancelled');

		ownerToken = await adapt.ownerOf(tokens[6]);
		assert.equal(ownerToken, ac.ADAPT_ADMIN, 'the original owner(ac.ADAPT_ADMIN) own the token');
	});
});


