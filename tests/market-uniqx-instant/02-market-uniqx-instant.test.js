import {
	accounts, assert, OrderStatus, BigNumber
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
const moment = require('moment');

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxInstant = artifacts.require('../../contracts/MarketUniqxInstant.sol');

contract('Testing token listing - many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenAdapt;

	const tokensCount = 10;
	let tokens = [];
	let buyPrices = [];

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
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${tokenAdapt.address}`);
	});

	it('should mint some test tokens', async function () {

		const ret = await tokenAdapt.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		console.log(`GAS - Mass mint ${tokensCount} adapt tokens: ${ret.receipt.gasUsed}`);

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenAdapt.tokenByIndex(i);
			buyPrices[i] = ether(9);
		}
	});

	it('should register the adapt token', async function () {

		const ret = await market.registerToken(
			tokenAdapt.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogRegisterToken');

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('should not be able to list zero tokens', async function () {
		await market.createMany(
			tokenAdapt.address,
			[],
			[],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able to transfer one of the tokens to ACCOUNT1', async function () {

		const ret = await tokenAdapt.transferFrom(
			ac.ADAPT_ADMIN,
			ac.ACCOUNT1,
			tokens[0],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		// console.log(`ret: ${JSON.stringify(ret, null, '\t')}`);
		expectEvent.inLogs(ret.logs, 'Transfer');
		const owner = await tokenAdapt.ownerOf(tokens[0]);
		assert.equal(owner, ac.ACCOUNT1, 'unexpected owner - ACCOUNT1 should own the token');
	});

	it('the SELLER should NOT be able to list 10 adapt tokens for sale unless he gets approval', async () => {
		await market.createMany(
			tokenAdapt.address,
			tokens,
			buyPrices,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ACCOUNT1 should be able to approve the SELLER to list his tokens', async function () {
		await tokenAdapt.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the SELLER to list his tokens', async function () {
		await tokenAdapt.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ACCOUNT1 should be able to approve the MARKET escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenAdapt.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the MARKET escrow his tokens', async function () {
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

	it('the SELLER should not be able to list a zero value token', async function () {
		await market.createMany(
			tokenAdapt.address,
			[tokens[0]],
			[0],
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to list 10 adapt tokens for sale - fixed price', async () => {

		const ret = await market.createMany(
			tokenAdapt.address,
			tokens,
			buyPrices,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.fulfilled;

		//console.log(`@@@@ rec: ${JSON.stringify(ret, null, '\t')}`);

		console.log(`GAS - List ${tokensCount} adapt tokens fixed price: ${ret.receipt.gasUsed}`);

		expectEvent.inLogs(ret.logs, 'LogCreateMany');

		for (let i = 0; i < tokensCount; i++) {
			const owner = await tokenAdapt.ownerOf(tokens[i]);
			assert.equal(owner, market.address, 'unexpected owner - market should own the token');

			const info = await market.getOrderInfo(tokenAdapt.address, tokens[i]);
			//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

			assert.equal(info[0], i === 0 ? ac.ACCOUNT1 : ac.ADAPT_ADMIN, 'unexpected owner');

			const buyPrice = new BigNumber(info[1]);
			buyPrice.should.be.bignumber.equal(buyPrices[i]);
		}
	});
});
