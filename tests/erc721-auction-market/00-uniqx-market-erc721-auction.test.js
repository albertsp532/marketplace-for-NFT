import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import { duration, increaseTimeTo } from "../../zeppelin/test/helpers/increaseTime";
import latestTime from '../../zeppelin/test/helpers/latestTime';
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";


const ERC721Token = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721Auction = artifacts.require('../../contracts/UniqxMarketERC721Auction.sol');

contract('Testing UniqxMarketERC721Instant', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let erc721Token, auctionMarket;
	let tokesCount = 10;
	let tokens = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the auction market contract', async () => {

		auctionMarket = await UniqxMarketERC721Auction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

	});

	it('should be able to register an ERC721 token contract', async () => {

		erc721Token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		const rec = await auctionMarket.registerContract(
			erc721Token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'RegisterContract');

		console.log('registerContract() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to mass mint new tokens', async function () {
		await erc721Token.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			1,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await erc721Token.tokenByIndex(i);
		}

		// console.log('Tokens: ', JSON.stringify(tokens, null, '\t'));
	});

	it('should be able to enable the market to transfer tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await erc721Token.setApprovalForAll(
			auctionMarket.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make 3 auctions', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();

		const rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[0], tokens[1], tokens[2]],
			[ ether(1), ether(1), ether(1) ],
			[ ether(2), ether(2), ether(2) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		const orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[0]);
		assert.equal(orderStatus, OrderStatus.Published);

		console.log('makeAuctions() with 3 auctions - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should allow buyer1 to place a bid for token0 and token1', async function () {
		const rec = await auctionMarket.bidAuctions(
			erc721Token.address,
			[ tokens[0], tokens[1]],
			[ ether(1.1), ether(1.1)],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(2.2) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionBidPlaced');
	});

	it('should allow buyer2 to outbid buyer1 and take the token0', async function () {
		const rec = await auctionMarket.bidAuctions(
			erc721Token.address,
			[ tokens[0] ],
			[ ether(3) ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(3) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionAcquired');
	});

	it('should allow buyer3 to outbid buyer1 on token1', async function () {

		const rec = await auctionMarket.bidAuctions(
			erc721Token.address,
			[ tokens[1] ],
			[ ether(1.2) ],
			{ from: ac.BUYER3 , gas: 7000000, value: ether(1.2) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionBidPlaced');
	});

	it('should not allow buyer3 to take the token1 yet, auction is still open', async function () {
		const rec = await auctionMarket.takeAuctions(
			erc721Token.address,
			[tokens[1]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		const owner = await erc721Token.ownerOf(tokens[1]);
		assert.notEqual(owner, ac.BUYER3);
		assert.equal(owner, auctionMarket.address); // market still owns the token
	});

	it('should not allow to cancel an auctoin if it was bidden and is still active', async () => {
		await auctionMarket.cancelAuctions(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('seek 1 week, should allow buyer3 to take token1', async function () {
		increaseTimeTo(moment().add(7, 'days').unix());

		const rec = await auctionMarket.takeAuctions(
			erc721Token.address,
			[tokens[1]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionAcquired');

		const owner = await erc721Token.ownerOf(tokens[1]);

		assert.equal(owner, ac.BUYER3);
		assert.notEqual(owner, auctionMarket.address); // market still owns the token
	});

	it('should be able to cancel auction', async () => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		let orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Published);

		rec = await auctionMarket.cancelAuctions(
			erc721Token.address,
			[ tokens[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCancelled');
		orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Cancelled);
	});

	it('should be able to cancel expired auction', async () => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		let orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Published);

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await auctionMarket.cancelAuctions(
			erc721Token.address,
			[ tokens[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCancelled');
		orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Cancelled);
	});

	it('should be able to cancel expired auction when bidden', async () => {

		const oneDayLater = latestTime() + duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		let orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Published);

		rec = await auctionMarket.bidAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1.1) ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1.1) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionBidPlaced');

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await auctionMarket.cancelAuctions(
			erc721Token.address,
			[ tokens[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCancelled');
		orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Cancelled);
	});

	it('should not be able to make auction with expiry date in the past', async () => {

		const oneDayInThePast = latestTime() - duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayInThePast ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should not be able to make auction with expiry lower than 1 hour in the future', async () => {

		const lessThanAnHourInTheFuture = latestTime() - duration.minutes(59);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ lessThanAnHourInTheFuture ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should anyone be able to settle if auction has ended', async function () {
		const oneDayLater = latestTime() + duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		let orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(orderStatus, OrderStatus.Published);

		rec = await auctionMarket.bidAuctions(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1.1) ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1.1) }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionBidPlaced');

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await auctionMarket.takeAuctions( // anyone can settle
			erc721Token.address,
			[tokens[3]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.fulfilled;

		const owner = await erc721Token.ownerOf(tokens[3]);
		assert.equal(owner, ac.BUYER1);
	});

	it('should not take ended auction that was not bidden', async function () {
		const oneDayLater = latestTime() + duration.days(1);

		let rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[4] ],
			[ ether(1) ],
			[ ether(2) ],
			[ oneDayLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		let orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[4]);
		assert.equal(orderStatus, OrderStatus.Published);

		increaseTimeTo(oneDayLater + duration.minutes(1));

		rec = await auctionMarket.takeAuctions(
			erc721Token.address,
			[tokens[4]],
			{ from: ac.BUYER3 , gas: 7000000}
		).should.be.rejectedWith(EVMRevert);

		let owner = await erc721Token.ownerOf(tokens[4]);
		assert.equal(owner, auctionMarket.address);

		await auctionMarket.cancelAuctions(
			erc721Token.address,
			[tokens[4]],
			{ from: ac.ADAPT_ADMIN , gas: 7000000}
		).should.be.fulfilled;

		owner = await erc721Token.ownerOf(tokens[4]);
		assert.equal(owner, ac.ADAPT_ADMIN);
	});
});


