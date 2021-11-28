import {
	accounts, assert, OrderStatus, BigNumber
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
const moment = require('moment');

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

contract('Testing token listing - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenAdapt;

	let token;
	let buyPrice;
	let startPrice;
	let endTime;

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

	it('should mint a test token', async function () {

		const ret = await tokenAdapt.mint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // copy
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		token = await tokenAdapt.tokenByIndex(0);
		buyPrice = ether(9);
		startPrice = ether(1);
		endTime = moment().add(3, 'days').unix();
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
			token,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		// console.log(`ret: ${JSON.stringify(ret, null, '\t')}`);
		expectEvent.inLogs(ret.logs, 'Transfer');
		const owner = await tokenAdapt.ownerOf(token);
		assert.equal(owner, ac.ACCOUNT1, 'unexpected owner - ACCOUNT1 should own the token');
	});

	it('the SELLER should NOT be able to list a token unless he gets approval', async () => {
		await market.create(
			tokenAdapt.address,
			token,
			buyPrice,
			startPrice,
			endTime,
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
		await market.create(
			tokenAdapt.address,
			token,
			0,
			0,
			endTime,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to list a token ', async () => {

		const ret = await market.create(
			tokenAdapt.address,
			token,
			buyPrice,
			startPrice,
			endTime,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.fulfilled;

		//console.log(`@@@@ rec: ${JSON.stringify(ret, null, '\t')}`);

		expectEvent.inLogs(ret.logs, 'LogCreate');
		const owner = await tokenAdapt.ownerOf(token);
		assert.equal(owner, market.address, 'unexpected owner - market should own the token');

		const info = await market.getOrderInfo(tokenAdapt.address, token);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');

		const actualBuyPrice = new BigNumber(info[1]);
		actualBuyPrice.should.be.bignumber.equal(buyPrice);

		assert.equal(info[2], '0x0000000000000000000000000000000000000000', 'unexpected buyer');

		const actualStartPrice = new BigNumber(info[3]);
		actualStartPrice.should.be.bignumber.equal(startPrice);

		assert.equal(info[4], endTime, 'unexpected end time');
		assert.equal(info[5], 0, 'unexpected highest bid');
	});

	it('the SELLER should NOT be able to list a token which is already listed', async function () {
		await market.create(
			tokenAdapt.address,
			token,
			buyPrice,
			startPrice,
			endTime,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
