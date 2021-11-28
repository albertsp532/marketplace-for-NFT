import {
	accounts, assert, should, BigNumber, Bluebird, listed
} from '../common/common';
import ether from "../helpers/ether";
import wei from "../helpers/wei";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import { duration, increaseTimeTo } from "../../zeppelin/test/helpers/increaseTime";
import latestTime from '../../zeppelin/test/helpers/latestTime';
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

contract('Freeride testing', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let tokenAdapt, market;
	let tokesCount = 10;
	let tokens = [];
	let prices = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the smart contracts', async () => {

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		tokenAdapt = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("ERC721 test contract deployed at addresses " + tokenAdapt.address);


		let rec = await market.registerToken(
			tokenAdapt.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'LogRegisterToken');
	});

	it('should be able to mass mint new tokens', async function () {

		await tokenAdapt.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to enable the market to transfer tokens', async function () {

		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await tokenAdapt.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await tokenAdapt.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to auction tokens 0, 1, 2', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();

		const rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[0], tokens[1], tokens[2]],
			[ ether(2), ether(2), ether(2) ],
			[ ether(1), ether(1), ether(1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;


		expectEvent.inLogs(rec.logs, 'LogCreateMany');
		for (let i = 0; i < 3; i++) {
			const listed = await market.tokenIsListed(tokenAdapt.address, tokens[i]);
			assert.equal(listed, true);
		}
	});

	it('should allow buyer1 to place a bid for tokens 0, 1', async function () {

		const rec = await market.bidMany(
			tokenAdapt.address,
			[ tokens[0], tokens[1]],
			[ ether(1.1), ether(1.1)],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(2.2) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogBid');
	});

	it('should allow buyer2 to outbid buyer1 and buy now the token 0', async function () {

		const buyer1Balance = await pGetBalance(ac.BUYER1);
		const buyer1BalanceShouldBeAfterOutbided = buyer1Balance .add(ether(1.1));

		const rec = await market.bidMany(
			tokenAdapt.address,
			[ tokens[0] ],
			[ ether(2) ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(2) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogBuy');
		const listed = await market.tokenIsListed(tokenAdapt.address, tokens[0]);
		assert.equal(listed, listed);

		const balanceBuyer1AfterOutbided = await pGetBalance(ac.BUYER1);
		balanceBuyer1AfterOutbided.should.be.bignumber.equal(buyer1BalanceShouldBeAfterOutbided);
	});

	it('should allow buyer3 to outbid buyer1 on token 1', async function () {

		const rec = await market.bidMany(
			tokenAdapt.address,
			[ tokens[1] ],
			[ ether(1.2) ],
			{ from: ac.BUYER3 , gas: 7000000, value: ether(1.2) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogBid');
	});

	it('should not allow buyer3 to settle the auction yet while is still open', async function () {

		const rec = await market.completeMany(
			tokenAdapt.address,
			[tokens[1]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.rejectedWith(EVMRevert);

		const owner = await tokenAdapt.ownerOf(tokens[1]);
		assert.notEqual(owner, ac.BUYER3);
	});

	it('should not allow to cancel an auction if it was bidden and is still active', async () => {

		await market.cancelMany(
			tokenAdapt.address,
			[ tokens[1] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('after 1 week, should allow buyer3 to settle and buy the token 1', async function () {

		let balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		increaseTimeTo(moment().add(7, 'days').unix());

		const rec = await market.completeMany(
			tokenAdapt.address,
			[tokens[1]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogBuy');

		const owner = await tokenAdapt.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3);
		let balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		let marketFeesShouldBe = ether(1.2).mul(1).div(100);
		let marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		let sellerFeesShouldBe = ether(1.2).sub(marketFeesShouldBe);
		let sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should be able to cancel an unbidden auction', async () => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogCreateMany');
		let listed = await market.tokenIsListed(tokenAdapt.address, tokens[3]);
		assert.equal(listed, true);

		rec = await market.cancelMany(
			tokenAdapt.address,
			[ tokens[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogCancelMany');
		listed = await market.tokenIsListed(tokenAdapt.address, tokens[3]);
		assert.equal(listed, false);
	});

	it('should not be able to make auction with expiry date in the past', async () => {

		const oneDayInThePast = latestTime() - duration.days(1);

		let rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayInThePast ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should not be able to make auction with expiry lower than 1 hour in the future', async () => {

		const lessThanAnHourInTheFuture = latestTime() - duration.minutes(59);

		let rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ lessThanAnHourInTheFuture ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should anyone be able to settle if auction has ended', async function () {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogCreateMany');
		let listed = await market.tokenIsListed(tokenAdapt.address, tokens[3]);
		assert.equal(listed, true);

		rec = await market.bidMany(
			tokenAdapt.address,
			[ tokens[3] ],
			[ ether(1.1) ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1.1) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogBid');

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await market.completeMany( // anyone can settle
			tokenAdapt.address,
			[tokens[3]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		const owner = await tokenAdapt.ownerOf(tokens[3]);
		assert.equal(owner, ac.BUYER1);
	});

	it('should be able to settle unbidden auction', async function () {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenAdapt.address,
			[ tokens[4] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogCreateMany');
		let listed = await market.tokenIsListed(tokenAdapt.address, tokens[4]);
		assert.equal(listed, true);

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await market.completeMany(
			tokenAdapt.address,
			[tokens[4]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		let owner = await tokenAdapt.ownerOf(tokens[4]);
		assert.equal(owner, ac.ADAPT_ADMIN);
	});
});