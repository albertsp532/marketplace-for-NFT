import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import { increaseTimeTo } from "../../zeppelin/test/helpers/increaseTime";


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

});


