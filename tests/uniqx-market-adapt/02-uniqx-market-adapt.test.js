import {
	accounts, assert, should, BigNumber, Bluebird, parseAdaptTokenEvent, parseUnixMarketEvent, parseAdaptMarketEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
import latestTime from '../../zeppelin/test/helpers/latestTime';
import { duration, increaseTimeTo } from '../../zeppelin/test/helpers/increaseTime';
import * as abiDecoder from 'abi-decoder';

const UniqxMarketAdapt = artifacts.require("../../../contracts/UniqxMarketAdapt.sol");
const AdaptToken = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('Adapt Market - test logging', function (rpc_accounts) {

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

	it('should watch and parse the the logs', async function () {

		const MarketAdaptJson = require('../../build/contracts/UniqxMarketAdapt.json');
		abiDecoder.addABI(MarketAdaptJson['abi']);

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

			const events = abiDecoder.decodeLogs([result]);
			await parseAdaptMarketEvent(events[0]);
		});
	});

	it('should be able to mint some tokens in ADAPT', async () => {

		await adapt.massMint(
			ac.ADAPT_ADMIN,
			'0xabcd',
			1,
			tokesCount,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		let balance = await adapt.balanceOf(ac.ADAPT_ADMIN);
		console.log(ac.ADAPT_ADMIN, 'balance= ', balance.toString(10));

	});

	it('should allow the market to escrow the adapt tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adapt.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});


	it('should be able to list the tokens in the adapt market', async () => {

		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await adapt.tokenByIndex(i);
			prices[i] = ether(1);
			reservations[i] = 0x0;
		}
		reservations[3] = ac.BUYER2;
		reservations[4] = ac.BUYER2;

		const { logs }  = await market.listTokens(
			tokens,
			prices,
			reservations,
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;

		let ownerToken1 = await adapt.ownerOf(tokens[0]);
		assert.equal(ownerToken1, market.address, 'MARKET should tmp own the token');

		await expectEvent.inLogs(logs, 'LogTokensListed');
	});

	it('should be able to cancel 2 tokens', async () => {
		await market.cancelTokens(
			[tokens[0], tokens[1]],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('BUYER1 should be able to donate for a token', async () => {
		await market.buyToken(
			tokens[2],
			{ from: ac.BUYER1, gas: 7000000, value: ether(3)}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to donate for a token reserved for BUYER2', async () => {
		await market.buyToken(
			tokens[3],
			{ from: ac.BUYER1, gas: 7000000, value: ether(3)}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should be able to donate for a token reserved for him', async () => {
		await market.buyToken(
			tokens[3],
			{ from: ac.BUYER2, gas: 7000000, value: ether(3)}
		).should.be.fulfilled;
	});

	it('BUYER3 should be able to donate for a token reserved for BUYER2 after the reservation expires', async () => {
		const threeDaysLater = latestTime() + duration.days(3);
		increaseTimeTo(threeDaysLater + duration.minutes(1));

		await market.buyToken(
			tokens[4],
			{ from: ac.BUYER3, gas: 7000000, value: ether(3)}
		).should.be.fulfilled;
	});

	it('BUYER1 should be able buy 5 tokens by paying the exact amount', async () => {
		await market.buyTokens(
			tokens.slice(5),
			{ from: ac.BUYER1, gas: 7000000, value: ether(5)}
		).should.be.fulfilled;
	});
});

