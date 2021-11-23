import {
	accounts, assert, BigNumber, getBalanceAsync, getBalanceAsyncStr, parseAdaptTokenEvent, parseUnixMarketEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import { duration, increaseTimeTo } from "../../zeppelin/test/helpers/increaseTime";
import latestTime from '../../zeppelin/test/helpers/latestTime';
const moment = require('moment');
import * as abiDecoder from 'abi-decoder';

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721 = artifacts.require('../../contracts/UniqxMarketERC721.sol');

const AdaptCollectiblesJson = require("../../build/contracts/AdaptCollectibles.json");
const UniqxMarketERC721Json = require('../../build/contracts/UniqxMarketERC721.json');

contract('Testing Auction listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let unixMarket;
	let adaptCollectibles;

	const tokensCount = 10;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		unixMarket = await UniqxMarketERC721.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${unixMarket.address}`);

		adaptCollectibles = await AdaptCollectibles.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptCollectibles.address}`);
	});

	it('should mint some test tokens', async function () {

		const ret = await adaptCollectibles.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		console.log(`GAS - Mass mint ${tokensCount} adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should register the adapt token', async function () {

		const ret = await unixMarket.registerToken(
			adaptCollectibles.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenRegistered');

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('should allow the market to escrow the adapt tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptCollectibles.setApprovalForAll(
			unixMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('should be able to list 10 adapt tokens for sale - auction format', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await adaptCollectibles.tokenByIndex(i);
			buyPrices[i] = ether(9);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}

		const rec = await unixMarket.listTokensAuction(
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

		console.log(`GAS - List ${tokensCount} adapt tokens fixed price: ${rec.receipt.gasUsed}`);

		expectEvent.inLogs(rec.logs, 'LogTokensListedAuction');
	});

	it('should be able to cancel 2 tokens', async () => {
		const rec = await unixMarket.cancelTokens(
			adaptCollectibles.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Cancel 2 adapt tokens: ${rec.receipt.gasUsed}`);

		expectEvent.inLogs(rec.logs, 'LogTokensCanceled');

		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);
	});


	it('BUYER1 should be able to place bids on 3 tokens', async function () {
		const ret = await unixMarket.placeBids(
			adaptCollectibles.address,
			[tokens[2], tokens[3], tokens[4]],
			[ether(2), ether(2), ether(2)],
			{
				from: ac.BUYER1,
				value: ether(6),
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		console.log(`GAS - Bid 2 adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('BUYER2 should be able to overbid BUYER1', async function () {
		const ret = await unixMarket.placeBids(
			adaptCollectibles.address,
			[tokens[4]],
			[ether(4)],
			{
				from: ac.BUYER2,
				value: ether(4),
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');

		console.log(`GAS - Bid 2 adapt tokens: ${ret.receipt.gasUsed}`);
	});


	it('BUYER2 should be able to place a bid big enough to buy the token', async function () {
		const ret = await unixMarket.placeBids(
			adaptCollectibles.address,
			[tokens[5]],
			[ether(9)],
			{
				from: ac.BUYER2,
				value: ether(9),
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogBidPlaced');
		expectEvent.inLogs(ret.logs, 'LogTokenSold');

		console.log(`GAS - Bid 2 adapt tokens: ${ret.receipt.gasUsed}`);
	});


	it('seek 3 days forward - should allow BUYER1 to finalize the auctions he won', async function () {
		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		const ret = await unixMarket.finalizeAuctions(
			adaptCollectibles.address,
			[tokens[2], tokens[3]],
			{
				from: ac.BUYER1,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenSold');
	});


	it('should allow BUYER2 to finalize the auctions he won', async function () {

		const ret = await unixMarket.finalizeAuctions(
			adaptCollectibles.address,
			[tokens[4]],
			{
				from: ac.BUYER2,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenSold');
	});

	it('should allow the owner to take the unsold tokens back', async function () {
		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		const ret = await unixMarket.finalizeAuctions(
			adaptCollectibles.address,
			tokens.slice(6),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenUnsold');
	});

	it('should watch and parse the the logs', async function () {

		// market

		abiDecoder.addABI(UniqxMarketERC721Json['abi']);

		const marketFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: unixMarket.address,
			}
		);

		marketFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}

			const events = abiDecoder.decodeLogs([result]);
			await parseUnixMarketEvent(events[0]);
		});


		// adapt

		abiDecoder.addABI(AdaptCollectiblesJson['abi']);

		const adaptCollectiblesFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: adaptCollectibles.address,
			}
		);

		adaptCollectiblesFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}

			const events = abiDecoder.decodeLogs([result]);
			await parseAdaptTokenEvent(events[0]);
		});
	});
});