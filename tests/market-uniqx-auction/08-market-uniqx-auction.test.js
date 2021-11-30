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
import latestTime from '../helpers/latestTime';

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

contract('Testing auction - bid - buy - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenAdapt;

	const tokensCount = 3;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${market.address}`);

		tokenAdapt = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${tokenAdapt.address}`);
	});

	it('ADAPT_ADMIN should mint some test tokens', async function () {
		const ret = await tokenAdapt.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenAdapt.tokenByIndex(i);
			buyPrices[i] = ether(2);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}
	});

	it('MARKET_ADMIN should register the adapt token', async function () {
		const ret = await market.registerToken(
			tokenAdapt.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
		await tokenAdapt.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list the tokens', async () => {
		await market.createMany(
			tokenAdapt.address,
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

	it('BUYER1 should not be able to place a bid - not enough ether', async function () {
		const bid = new BigNumber(ether(0.1));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - too much ether', async function () {
		const bid = new BigNumber(ether(3));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async function () {
		const bid = new BigNumber(ether(1.2));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBid');

		const info = await market.getOrderInfo(tokenAdapt.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should not be able to place a bid which is less than the highest bid', async function () {
		const bid = new BigNumber(ether(1.1));

		await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is equal to the highest bid', async function () {
		const bid = new BigNumber(ether(1.2));

		await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should be able to outbid BUYER1', async function () {
		const bid = new BigNumber(ether(1.3));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBid');

		const info = await market.getOrderInfo(tokenAdapt.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should be able to outbid himself', async function () {
		const bid = new BigNumber(ether(1.4));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBid');

		const info = await market.getOrderInfo(tokenAdapt.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER3 should be able to place a bid to buy the token', async function () {

		const bid = new BigNumber(ether(2));

		const ret = await market.bid(
			tokenAdapt.address,
			tokens[1],
			{
				from: ac.BUYER3,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBid');
		expectEvent.inLogs(ret.logs, 'LogBuy');

		const owner = await tokenAdapt.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		const info = await market.getOrderInfo(tokenAdapt.address, tokens[1]);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);
		assert.equal(info[0], OrderStatus.Unknown, 'unexpected status - should be unknwon');
	});

	it('BUYER2 should not be able to place a bid on a sold token', async function () {
		const bid = new BigNumber(ether(2));

		await market.bid(
			tokenAdapt.address,
			tokens[1],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});


	it('BUYER1 should not be able to place a bid on an ended auction', async function () {

		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		const bid = new BigNumber(ether(1.6));

		await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 can take the tokens he won', async function () {

		const ret = await market.completeMany(
			tokenAdapt.address,
			[tokens[0]],
			{
				from: ac.BUYER2,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBuy');

		let owner = await tokenAdapt.ownerOf(tokens[0]);
		assert.equal(owner, ac.BUYER2, 'unexpected owner');
	});

	it('ADAPT_ADMIN can take his unsold tokens back', async function () {

		const ret = await market.completeMany(
			tokenAdapt.address,
			[tokens[2]],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogRetake');

		for(let i = 4; i < tokensCount; i++) {
			let owner = await tokenAdapt.ownerOf(tokens[i]);
			assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
		}
	});
});
