import {
	accounts, assert, BigNumber, getBalanceAsync
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxInstant = artifacts.require('../../contracts/MarketUniqxInstant.sol');

contract('Testing buy now functionality - many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenAdapt;

	const tokensCount = 10;
	let tokens = [];
	let prices = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		market = await MarketUniqxInstant.new(
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
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${tokenAdapt.address}`);
	});

	it('should mint some test tokens', async function () {
		const ret = await tokenAdapt.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		console.log(`GAS - Mass mint ${tokensCount} adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should register the adapt token', async function () {

		const ret = await market.registerToken(
			tokenAdapt.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);

		expectEvent.inLogs(ret.logs, 'LogRegisterToken');

		const status = await market.getTokenContractStatus(tokenAdapt.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenAdapt.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});


	it('ADAPT_ADMIN should be able to list 10 adapt tokens for sale - fixed price', async () => {

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenAdapt.tokenByIndex(i);
			prices[i] = ether(1);
		}

		const rec = await market.createMany(
			tokenAdapt.address,
			tokens,
			prices,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy zero tokens', async function () {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenAdapt.address,
			[],
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the tokens - not enough ether', async function () {
		const priceToPay = new BigNumber(ether(1));

		const ret = await market.buyMany(
			tokenAdapt.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the tokens - too much ether', async function () {
		const priceToPay = new BigNumber(ether(11));

		const ret = await market.buyMany(
			tokenAdapt.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy 10 tokens', async () => {

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenAdapt.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Buy 10 adapt tokens: ${ret.receipt.gasUsed}`);

		expectEvent.inLogs(ret.logs, 'LogBuyMany');

		// TODO: get these from contract
		const marketFee = priceToPay.dividedToIntegerBy(100);
		const ownerDue = priceToPay - marketFee;

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);

		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		for (let token of tokens) {
			assert.equal(await tokenAdapt.ownerOf(token), ac.BUYER1, 'unexpected owner  - should be buyer1');
		}
	});

	it('BUYER2 should not be able to buy the tokens - tokens already sold to buyer1', async function () {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenAdapt.address,
			tokens,
			{
				from: ac.BUYER2,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
