import {
	accounts,
	assert,
	BigNumber,
	OrderStatus,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from '../helpers/latestTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing auction functionality', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 10;
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
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should register the erc721 token', async() => {

		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
			}
		).should.be.fulfilled;

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('ADAPT_ADMIN should allow the market to escrow his tokens', async() => {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list 10 erc721 tokens for sale - auction', async () => {

		const threeDaysLater = latestTime() + duration.days(3);
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(2);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}

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

	it('ADAPT_ADMIN should be able to cancel an auction with zero bids', async() => {
		const rec = await market.cancelMany(
			tokenErc721.address,
			[tokens[0]],
			{
				from: ac.ADAPT_ADMIN ,
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCancelMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0] ]
		});

		const owner = await tokenErc721.ownerOf(tokens[0]);
		assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
	});

	it('BUYER1 should not be able to place zero bids', async() => {
		const bid = new BigNumber(ether(10));

		const ret = await market.bidMany(
			tokenErc721.address,
			[],
			[],
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - not enough ether', async() => {
		const bid = new BigNumber(ether(0.1));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - too much ether', async() => {
		const bid = new BigNumber(ether(3));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place bids - not enough ether', async() => {

		const bid = new BigNumber(ether(8));

		const ret = await market.bidMany(
			tokenErc721.address,
			tokens.slice(1),
			startPrices.slice(1),
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place bids - too much ether', async() => {
		const bid = new BigNumber(ether(100));

		const ret = await market.bidMany(
			tokenErc721.address,
			tokens.slice(1),
			startPrices.slice(1),
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async() => {
		const bid = new BigNumber(ether(1.2));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid,
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER1,
			bid: bid
		});

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('ADAPT_ADMIN should not be able to cancel a bidden auction', async() => {
		const rec = await market.cancelMany(
			tokenErc721.address,
			[tokens[1]],
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is less than the highest bid', async() => {
		const bid = new BigNumber(ether(1.1));

		await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is equal to the highest bid', async() => {
		const bid = new BigNumber(ether(1.2));

		await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should be able to outbid BUYER1', async() => {
		const bid = new BigNumber(ether(1.3));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER2,
			bid: bid
		});

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should be able to outbid himself', async() => {
		const bid = new BigNumber(ether(1.4));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER2,
			bid: bid
		});

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER3 should be able to place a bid to buy the token', async() => {

		const bid = new BigNumber(ether(2));

		const ret = await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER3,
				value: bid
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(2);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER3,
			bid: bid
		});
		await expectEvent.inLog(ret.logs[1], 'LogBuy', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			buyer: ac.BUYER3
		});

		const owner = await tokenErc721.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);
		assert.equal(info[0], OrderStatus.Unknown, 'unexpected status - should be unknwon');
	});

	it('BUYER2 should not be able to place a bid on a sold token', async() => {
		const bid = new BigNumber(ether(2));

		await market.bidMany(
			tokenErc721.address,
			[tokens[1]],
			[bid],
			{
				from: ac.BUYER2,
				value: bid
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER3 should be able to place 2 bids', async() => {

		const bid = new BigNumber(ether(1.5));
		const overall = new BigNumber(ether(3));

		const tokens_ = [tokens[2], tokens[3]];
		const ret = await market.bidMany(
			tokenErc721.address,
			tokens_,
			[bid, bid],
			{
				from: ac.BUYER3,
				value: overall
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(2);
		for (let i = 0; i < 2; i++) {
			await expectEvent.inLog(ret.logs[i], 'LogBid', {
				erc721: tokenErc721.address,
				tokenId: tokens_[i],
				bidder: ac.BUYER3,
				bid: bid
			});
		}

		let info = await market.getOrderInfo(tokenErc721.address, tokens[2]);
		let highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);

		info = await market.getOrderInfo(tokenErc721.address, tokens[3]);
		highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER1 should not be able to place a bid on an ended auction', async() => {

		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const bid = new BigNumber(ether(1.6));

		await market.bidMany(
			tokenErc721.address,
			[tokens[2]],
			[bid],
			{
				from: ac.BUYER1,
				value: bid
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER3 can take the tokens he won', async() => {

		for (let i = 2; i < 4; i++) {
			const ret = await market.complete(
				tokenErc721.address,
				tokens[i],
				{
					from: ac.BUYER3
				}
			).should.be.fulfilled;

			ret.logs.length.should.be.equal(1);

			await expectEvent.inLog(ret.logs[0], 'LogBuy', {
				erc721: tokenErc721.address,
				tokenId: tokens[i],
				buyer: ac.BUYER3
			});
		}

		let owner = await tokenErc721.ownerOf(tokens[2]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		owner = await tokenErc721.ownerOf(tokens[3]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');
	});

	it('ADAPT_ADMIN can take his unsold tokens back', async() => {

		for (let i = 4; i < tokens.length; i++) {
			const ret = await market.complete(
				tokenErc721.address,
				tokens[i],
				{
					from: ac.ADAPT_ADMIN
				}
			).should.be.fulfilled;

			ret.logs.length.should.be.equal(1);

			await expectEvent.inLog(ret.logs[0], 'LogRetake', {
				erc721: tokenErc721.address,
				tokenId: tokens[i],
			});
		}

		for(let i = 4; i < tokensCount; i++) {
			let owner = await tokenErc721.ownerOf(tokens[i]);
			assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
		}
	});
});
