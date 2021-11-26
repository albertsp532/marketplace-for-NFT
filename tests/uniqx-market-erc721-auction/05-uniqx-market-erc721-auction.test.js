import {
	accounts,
	assert,
	BigNumber,
	OrderStatus,
	getBalanceAsync,
	getBalanceAsyncStr,
	parseAdaptTokenEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
import { duration, increaseTimeTo } from '../../zeppelin/test/helpers/increaseTime';
import latestTime from '../../zeppelin/test/helpers/latestTime';

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721 = artifacts.require('../../contracts/UniqxMarketERC721Auction.sol');

contract('Testing auction functionality', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarket;
	let adaptCollectibles;

	const tokensCount = 10;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		uniqxMarket = await UniqxMarketERC721.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarket.address}`);

		adaptCollectibles = await AdaptCollectibles.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptCollectibles.address}`);
	});

	it('should mint some test tokens', async function () {
		const ret = await adaptCollectibles.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		console.log(`GAS - Mass mint ${tokensCount} adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should register the adapt token', async function () {

		const ret = await uniqxMarket.registerToken(
			adaptCollectibles.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);

		expectEvent.inLogs(ret.logs, 'LogTokenRegistered');

		const status = await uniqxMarket.getTokenContractStatus(adaptCollectibles.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptCollectibles.setApprovalForAll(
			uniqxMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list 10 adapt tokens for sale - auction', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await adaptCollectibles.tokenByIndex(i);
			buyPrices[i] = ether(2);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}

		await uniqxMarket.listTokensAuction(
			adaptCollectibles.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to cancel an auction with zero bids', async function () {
		const rec = await uniqxMarket.cancelTokens(
			adaptCollectibles.address,
			[tokens[0]],
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogTokensCancelled');

		const owner = await adaptCollectibles.ownerOf(tokens[0]);
		assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
	});

	it('BUYER1 should not be able to place zero bids', async function () {
		const bid = new BigNumber(ether(10));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[],
			[],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - not enough ether', async function () {
		const bid = new BigNumber(ether(0.1));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - too much ether', async function () {
		const bid = new BigNumber(ether(3));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place bids - not enough ether', async function () {

		const bid = new BigNumber(ether(8));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			tokens.slice(1),
			startPrices.slice(1),
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place bids - too much ether', async function () {
		const bid = new BigNumber(ether(100));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			tokens.slice(1),
			startPrices.slice(1),
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async function () {
		const bid = new BigNumber(ether(1.2));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		const info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('ADAPT_ADMIN should not be able to cancel a bidden auction', async function () {
		const rec = await uniqxMarket.cancelTokens(
			adaptCollectibles.address,
			[tokens[1]],
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is less than the highest bid', async function () {
		const bid = new BigNumber(ether(1.1));

		await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is equal to the highest bid', async function () {
		const bid = new BigNumber(ether(1.2));

		await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should be able to outbid BUYER1', async function () {
		const bid = new BigNumber(ether(1.3));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		const info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should be able to outbid himself', async function () {
		const bid = new BigNumber(ether(1.4));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		const info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER3 should be able to place a bid to buy the token', async function () {

		const bid = new BigNumber(ether(2));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER3,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');
		expectEvent.inLogs(ret.logs, 'LogTokenSold');

		const owner = await adaptCollectibles.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		const info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[1]);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);
		assert.equal(info[0], OrderStatus.Unknown, 'unexpected status - should be unknwon');
	});

	it('BUYER2 should not be able to place a bid on a sold token', async function () {
		const bid = new BigNumber(ether(2));

		await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER3 should be able to place 2 bids', async function () {

		const bid = new BigNumber(ether(1.5));
		const overall = new BigNumber(ether(3));

		const ret = await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[2], tokens[3]],
			[bid, bid],
			{
				from: ac.BUYER3,
				value: overall,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		let info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[2]);
		let highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);

		info = await uniqxMarket.getOrderInfo(adaptCollectibles.address, tokens[3]);
		highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER1 should not be able to place a bid on an ended auction', async function () {

		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		const bid = new BigNumber(ether(1.6));

		await uniqxMarket.placeBids(
			adaptCollectibles.address,
			[tokens[2]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER3 can take the tokens he won', async function () {

		const ret = await uniqxMarket.finalizeAuctions(
			adaptCollectibles.address,
			[tokens[2], tokens[3]],
			{
				from: ac.BUYER3,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenSold');

		let owner = await adaptCollectibles.ownerOf(tokens[2]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		owner = await adaptCollectibles.ownerOf(tokens[3]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');
	});


	it('ADAPT_ADMIN can take his unsold tokens back', async function () {

		const ret = await uniqxMarket.finalizeAuctions(
			adaptCollectibles.address,
			tokens.slice(4),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenUnsold');

		for(let i = 4; i < tokensCount; i++) {
			let owner = await adaptCollectibles.ownerOf(tokens[i]);
			assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
		}
	});
});
