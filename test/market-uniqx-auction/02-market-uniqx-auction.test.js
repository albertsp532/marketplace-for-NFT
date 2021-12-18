import {
	accounts,
	assert,
	should,
	BigNumber,
	Bluebird,
	listed,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
const moment = require('moment');
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from '../helpers/latestTime';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Freeride testing', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let tokenErc721, market;
	let tokensCount = 10;
	let tokens = [];
	let prices = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the smart contracts', async () => {

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log("ERC721 test contract deployed at addresses " + tokenErc721.address);


		let rec = await market.registerToken(
			tokenErc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });
	});

	it('should be able to mass mint new tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should be able to enable the market to transfer tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to auction tokens 0, 1, 2', async () => {

		const threeDaysLater = latestTime() + duration.days(3);

		const rec = await market.createMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2]],
			[ ether(2), ether(2), ether(2) ],
			[ ether(1), ether(1), ether(1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;


		const owners = Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN);
		owners[0] = ac.ACCOUNT1;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds:[ tokens[0], tokens[1], tokens[2]],
			owners: Array(...Array(3)).map(() =>  ac.ADAPT_ADMIN),
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ ether(2), ether(2), ether(2) ],
			startPrices: [ ether(1), ether(1), ether(1) ],
			endTimes: [ new BigNumber(threeDaysLater), new BigNumber(threeDaysLater), new BigNumber(threeDaysLater) ],
		});

		for (let i = 0; i < 3; i++) {
			const listed = await market.tokenIsListed(tokenErc721.address, tokens[i]);
			assert.equal(listed, true);
		}
	});

	it('should allow buyer1 to place a bid for tokens 0, 1', async() => {

		const rec = await market.bidMany(
			tokenErc721.address,
			[ tokens[0], tokens[1]],
			[ ether(1.1), ether(1.1)],
			{ from: ac.BUYER1 , value: ether(2.2) }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(2);
		for (let i = 0; i < 2; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogBid', {
				erc721: tokenErc721.address,
				tokenId: tokens[i],
				bidder: ac.BUYER1,
				bid: ether(1.1)
			});
		}
	});

	it('should allow buyer2 to outbid buyer1 and buy now the token 0', async() => {

		const buyer1Balance = await pGetBalance(ac.BUYER1);
		const buyer1BalanceShouldBeAfterOutbided = buyer1Balance .add(ether(1.1));

		const rec = await market.bidMany(
			tokenErc721.address,
			[ tokens[0] ],
			[ ether(2) ],
			{ from: ac.BUYER2 , value: ether(2) }
		).should.be.fulfilled;

		const listed = await market.tokenIsListed(tokenErc721.address, tokens[0]);
		assert.equal(listed, listed);

		const balanceBuyer1AfterOutbided = await pGetBalance(ac.BUYER1);
		balanceBuyer1AfterOutbided.should.be.bignumber.equal(buyer1BalanceShouldBeAfterOutbided);
	});

	it('should allow buyer3 to outbid buyer1 on token 1', async() => {

		const rec = await market.bidMany(
			tokenErc721.address,
			[ tokens[1] ],
			[ ether(1.2) ],
			{ from: ac.BUYER3 , value: ether(1.2) }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER3,
			bid: ether(1.2)
		});
	});

	it('should not allow buyer3 to settle the auction yet while is still open', async() => {

		const rec = await market.complete(
			tokenErc721.address,
			tokens[1],
			{ from: ac.BUYER3 }
		).should.be.rejectedWith(EVMRevert);

		const owner = await tokenErc721.ownerOf(tokens[1]);
		assert.notEqual(owner, ac.BUYER3);
	});

	it('should not allow to cancel an auction if it was bidden and is still active', async () => {

		await market.cancel(
			tokenErc721.address,
			tokens[1],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('after 1 week, should allow buyer3 to settle and buy the token 1', async() => {

		let balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		await increaseTimeTo(latestTime() + duration.days(7));

		const rec = await market.complete(
			tokenErc721.address,
			tokens[1],
			{ from: ac.BUYER3 }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBuy', {
			erc721: tokenErc721.address,
			tokenId: tokens[1],
			buyer: ac.BUYER3
		});

		const owner = await tokenErc721.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3);
		let balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		let balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		let marketFeesShouldBe = ether(1.2).mul(1).div(100);
		let marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		let sellerFeesShouldBe = ether(1.2).sub(marketFeesShouldBe);
		let sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should be able to cancel an unbidden auction', async () => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[3] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [  ether(2) ],
			startPrices: [  ether(1) ],
			endTimes: [ new BigNumber(oneDayLater) ]
		});

		let listed = await market.tokenIsListed(tokenErc721.address, tokens[3]);
		assert.equal(listed, true);

		rec = await market.cancel(
			tokenErc721.address,
			tokens[3],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCancel', {
			erc721: tokenErc721.address,
			tokenId: tokens[3],
		});


		listed = await market.tokenIsListed(tokenErc721.address, tokens[3]);
		assert.equal(listed, false);
	});

	it('should not be able to make auction with expiry date in the past', async () => {

		const oneDayInThePast = latestTime() - duration.days(1);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayInThePast ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should not be able to make auction with expiry lower than 1 hour in the future', async () => {

		const lessThanAnHourInTheFuture = latestTime() - duration.minutes(59);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ lessThanAnHourInTheFuture ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should anyone be able to settle if auction has ended', async() => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[3] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ ether(2) ],
			startPrices: [ ether(1) ],
			endTimes: [ new BigNumber(oneDayLater) ]
		});

		let listed = await market.tokenIsListed(tokenErc721.address, tokens[3]);
		assert.equal(listed, true);

		rec = await market.bidMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(1.1) ],
			{ from: ac.BUYER1 , value: ether(1.1) }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[3],
			bidder: ac.BUYER1,
			bid: ether(1.1)
		});

		await increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await market.complete( // anyone can settle
			tokenErc721.address,
			tokens[3],
			{ from: ac.BUYER3 }
		).should.be.fulfilled;

		const owner = await tokenErc721.ownerOf(tokens[3]);
		assert.equal(owner, ac.BUYER1);
	});

	it('should be able to settle unbidden auction', async() => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[4] ],
			[ ether(2) ],
			[ ether(1) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[4] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ ether(2) ],
			startPrices: [ ether(1) ],
			endTimes: [ new BigNumber(oneDayLater) ]
		});

		let listed = await market.tokenIsListed(tokenErc721.address, tokens[4]);
		assert.equal(listed, true);

		await increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await market.complete(
			tokenErc721.address,
			tokens[4],
			{ from: ac.BUYER3 }
		).should.be.fulfilled;

		let owner = await tokenErc721.ownerOf(tokens[4]);
		assert.equal(owner, ac.ADAPT_ADMIN);
	});
});
