import {
	accounts,
	assert,
	BigNumber,
	OrderStatus,
	getBalanceAsync,
	getBalanceAsyncStr,
	parseAdaptTokenEvent, parseUniqxAuctionMarketEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
import { duration, increaseTimeTo } from '../../zeppelin/test/helpers/increaseTime';
import latestTime from '../../zeppelin/test/helpers/latestTime';
import * as abiDecoder from 'abi-decoder';

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

contract('Testing update auction - single & many', async function (rpc_accounts) {

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

	it('should watch and parse the the logs', async function () {

		// market

		abiDecoder.addABI(MarketUniqxAuction.abi);

		const marketFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: market.address,
			}
		);

		marketFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}
			const blockTimestamp = await web3.eth.getBlock(result['blockNumber']).timestamp;

			const events = abiDecoder.decodeLogs([result]);
			await parseUniqxAuctionMarketEvent(events[0], blockTimestamp);
		});
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
			buyPrices[i] = ether(5);
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

	it('ADAPT_ADMIN should NOT be able update a token - buy price should be > 0', async function () {
		await market.update(
			tokenAdapt.address,
			tokens[0],
			0,
			0,
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update tokens - buy prices should be > 0', async function () {
		await market.updateMany(
			tokenAdapt.address,
			tokens,
			[0, 0, 0],
			[0, 0, 0],
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update a token - Start price must be less than or equal to the buy price', async function () {
		await market.update(
			tokenAdapt.address,
			tokens[0],
			1,
			2,
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update tokens - Start prices must be less than or equal to the buy prices', async function () {
		await market.updateMany(
			tokenAdapt.address,
			tokens,
			[1, 1, 1],
			[2, 2, 2],
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});


	it('ADAPT_ADMIN should NOT be able update a token - A minimum auction duration(1h) is enforced by the market', async function () {
		await market.update(
			tokenAdapt.address,
			tokens[0],
			2,
			1,
			moment().add(59, 'minutes').unix(),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async function () {
		const bid = new BigNumber(ether(1.2));
		await market.bid(
			tokenAdapt.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should NOT be able update a token - Only zero bids auctions can be updated', async function () {
		await market.update(
			tokenAdapt.address,
			tokens[0],
			ether(6),
			ether(2),
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able update a token', async function () {
		await market.update(
			tokenAdapt.address,
			tokens[1],
			ether(6),
			ether(2),
			endTimes[1],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		const info = await market.getOrderInfo(tokenAdapt.address, tokens[1]);

		assert.equal(info[0], ac.ADAPT_ADMIN, 'unexpected owner');

		const buyPrice = new BigNumber(info[1]);
		buyPrice.should.be.bignumber.equal(ether(6));

		assert.equal(info[2], '0x0000000000000000000000000000000000000000', 'unexpected buyer');

		const startPrice = new BigNumber(info[3]);
		startPrice.should.be.bignumber.equal(ether(2));

		assert.equal(info[4], endTimes[1], 'unexpected end time');
		assert.equal(info[5], 0, 'unexpected highest bid');
	});

	it('3 days later - ADAPT_ADMIN should NOT be able update a token - Auction must be open', async function () {

		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		await market.update(
			tokenAdapt.address,
			tokens[2],
			ether(7),
			ether(3),
			moment().add(10, 'days').unix(),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
