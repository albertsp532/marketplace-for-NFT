import {
	accounts,
	assert,
	BigNumber,
} from '../common/common';
import ether from '../helpers/ether';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from '../helpers/latestTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing update auction - single & many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 3;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the erc721 token', async() => {

		console.log('Deploying the market contract...');

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${market.address}`);

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR}
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('ADAPT_ADMIN should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
		const threeDaysLater = latestTime() + duration.days(3);
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(5);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}
	});

	it('MARKET_ADMIN should register the erc721 token', async() => {
		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async() => {
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list the tokens', async () => {
		await market.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should NOT be able update a token - buy price should be > 0', async() => {
		await market.update(
			tokenErc721.address,
			tokens[0],
			0,
			0,
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update tokens - buy prices should be > 0', async() => {
		await market.updateMany(
			tokenErc721.address,
			tokens,
			[0, 0, 0],
			[0, 0, 0],
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update a token - Start price must be less than or equal to the buy price', async() => {
		await market.update(
			tokenErc721.address,
			tokens[0],
			1,
			2,
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should NOT be able update tokens - Start prices must be less than or equal to the buy prices', async() => {
		await market.updateMany(
			tokenErc721.address,
			tokens,
			[1, 1, 1],
			[2, 2, 2],
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});


	it('ADAPT_ADMIN should NOT be able update a token - A minimum auction duration(1h) is enforced by the market', async() => {
		await market.update(
			tokenErc721.address,
			tokens[0],
			2,
			1,
			latestTime() + duration.minutes(59),
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async() => {
		const bid = new BigNumber(ether(1.2));
		await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should NOT be able update a token - Only zero bids auctions can be updated', async() => {
		await market.update(
			tokenErc721.address,
			tokens[0],
			ether(6),
			ether(2),
			endTimes[0],
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able update a token', async() => {
		await market.update(
			tokenErc721.address,
			tokens[1],
			ether(6),
			ether(2),
			endTimes[1],
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);

		assert.equal(info[0], ac.ADAPT_ADMIN, 'unexpected owner');

		const buyPrice = new BigNumber(info[1]);
		buyPrice.should.be.bignumber.equal(ether(6));

		assert.equal(info[2], '0x0000000000000000000000000000000000000000', 'unexpected buyer');

		const startPrice = new BigNumber(info[3]);
		startPrice.should.be.bignumber.equal(ether(2));

		assert.equal(info[4], endTimes[1], 'unexpected end time');
		assert.equal(info[5], 0, 'unexpected highest bid');
	});

	it('3 days later - ADAPT_ADMIN should NOT be able update a token - Auction must be open', async() => {

		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		await market.update(
			tokenErc721.address,
			tokens[2],
			ether(7),
			ether(3),
			latestTime() + duration.days(10),
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
