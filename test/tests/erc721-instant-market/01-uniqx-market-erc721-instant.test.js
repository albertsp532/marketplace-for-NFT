import {
	accounts, assert, should, BigNumber, Bluebird
} from '../../common/common';
import ether from "../../helpers/ether";
import expectEvent from "../../helpers/expectEvent";
import EVMRevert from "../../../zeppelin/test/helpers/EVMRevert";


const UniqxMarketERC721Instant = artifacts.require("../../contracts/UniqxMarketERC721Instant.sol");
const ERC721Token = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('testing the functionality - ', function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let erc721Token, market;
	let tokesCount = 10;
	let tokens = [];
	let prices = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the smart contracts', async () => {

		market = await UniqxMarketERC721Instant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		erc721Token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("ERC721 test contract deployed at address " + erc721Token.address);


		const { logs } = await market.registerContract(
			erc721Token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'RegisterContract');

		console.log("ERC721 contract " + market.address + " sucessfully registered");
	});

	it('should not be able to register a duplicate contract', async () => {
		await market.registerContract(
			erc721Token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should not allow other than admin to register a contract', async () => {
		const token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		await market.registerContract(
			token.address,
			{ from: ac.ACCOUNT1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

    it('should be able to mass mint new tokens', async function () {
		await erc721Token.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to enable the market to transfer tokens', async function () {
		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await erc721Token.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await erc721Token.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make multiple orders in one transaction', async () => {
		const { logs } = await market.makeOrders(
			erc721Token.address,
			tokens,
			prices,
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogOrdersCreated');

		for (let i = 0; i < tokens.length; i++) {
			let tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[i]);

			assert.equal(tokenStatus, 1, 'Order should be in \'Created\' State');

			const ownerToken = await erc721Token.ownerOf(tokens[i]);
			assert.equal(ownerToken, market.address, 'MARKET should tmp own the token');
		}
	});

	it('should not be able to make an order twice', async () => {
		const { logs } = await market.makeOrders(
			erc721Token.address,
			[ tokens[0] ],
			[ ether(1.5) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to cancel order', async () => {
		const ownerToken1 = await erc721Token.ownerOf(tokens[0]);
		assert.equal(ownerToken1, market.address, 'MARKET should tmp own the token');

		const { logs } = await market.cancelOrders(
			erc721Token.address,
			[ tokens[0] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogOrdersCancelled');

		const tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[0]);
		assert.equal(tokenStatus, 0);

		const ownerToken2 = await erc721Token.ownerOf(tokens[0]);
		assert.equal(ownerToken2, ac.ADAPT_ADMIN, 'ADAPT_ADMIN should now own the item');
	});

	it('should not allow other than the owner to cancel an order', async () => {
		// a regular user should not be allowed
		const { logs } = await market.cancelOrders(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.ACCOUNT1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		// the market owner should not be allowed
		await market.cancelOrders(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to take order', async () => {
		const balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		const balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		const { logs } = await market.takeOrders(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		const tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[1]);
		assert.equal(tokenStatus, 0);

		await expectEvent.inLogs(logs, 'LogOrderAcquired');

		const ownerOfToken = await erc721Token.ownerOf(tokens[1]);
		assert.equal(ownerOfToken, ac.BUYER1, 'BUYER1 should now be the owner of token');

		const balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		const balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		const marketFeesShouldBe = ether(1).mul(1).div(100);
		const marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		const sellerFeesShouldBe = ether(1).sub(marketFeesShouldBe);
		const sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should not be able to take order if price is lower than the asked price', async () => {
		await market.takeOrders(
			erc721Token.address,
			[ tokens[2] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000, value: ether(0.99) }
		).should.be.rejectedWith(EVMRevert);

		const tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[2]);
		assert.equal(tokenStatus, 1, 'The order should remain in \'Created\' state');
	});

	it('should not be able to take order if price is greater than the asked price', async () => {
		await market.takeOrders(
			erc721Token.address,
			[ tokens[2] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000, value: ether(1.1) }
		).should.be.rejectedWith(EVMRevert);

		const tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[2]);
		assert.equal(tokenStatus, 1, 'The order should remain in \'Created\' state');
	});

	it('should be able to change an order', async () => {
		await market.makeOrders(
			erc721Token.address,
			[ tokens[0] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		const { logs } = await market.changeOrders(
			erc721Token.address,
			[ tokens[0] ],
			[ 2 ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		const orderInfo = await market.getOrderInfo(erc721Token.address, tokens[0]);

		await expectEvent.inLogs(logs, 'LogOrdersChanged');

		orderInfo[0].should.be.bignumber.equal(1); // 'Created' status
		orderInfo[1].should.be.bignumber.equal(2);  // price
	});

	it('should not be able to make an order if the market was not apporved for the seller', async () => {
		const { logs } = await market.takeOrders(
			erc721Token.address,
			[ tokens[3] ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		const tokenStatus = await market.getOrderStatus(erc721Token.address, tokens[3]);
		assert.equal(tokenStatus, 0);

		await expectEvent.inLogs(logs, 'LogOrderAcquired');

		const ownerOfToken = await erc721Token.ownerOf(tokens[1]);
		assert.equal(ownerOfToken, ac.BUYER1, 'BUYER1 should now be the owner of token');

		await market.makeOrders(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1.5) ],
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to make an order for a token which was taken before', async () => {
		// approve the market to transfer the tokens owned by ac.BUYER1
		await erc721Token.setApprovalForAll(
			market.address,
			true,
			{ from: ac.BUYER1 }
		).should.be.fulfilled;

		const { logs } = await market.makeOrders(
			erc721Token.address,
			[ tokens[3] ],
			[ ether(1.5) ],
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogOrdersCreated');
	});

	it('should be able to change the market fee', async () => {
		const { logs } = await market.setPercentageFee(
			275, // set the fee to 2.7%
			1000,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'SetPercentageFee');
	});

	it('should not allow other than admin to change the market fee', async () => {
		const { logs } = await market.setPercentageFee(
			1,
			100,
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

	});

	it('should the market fee be calculated according to the new value', async () => {
		const balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);

		const { logs } = await market.takeOrders(
			erc721Token.address,
			[ tokens[4] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;


		const balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);

		const marketFeesShouldBe = ether(1).mul(275).div(1000);
		const marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
	});

	it('should be able to take multiple orders', async () => {
		const balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		const balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		const { logs } = await market.takeOrders(
			erc721Token.address,
			[ tokens[5], tokens[6] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(2) }
		).should.be.fulfilled;


		const balanceMarketFees2 = await pGetBalance(ac.MARKET_FEES_MSIG);
		const balanceAdaptAdmin2 = await pGetBalance(ac.ADAPT_ADMIN);

		const marketFeesShouldBe = ether(2).mul(275).div(1000);
		const marketBalanceShouldBe = balanceMarketFees1.add(marketFeesShouldBe);

		const sellerFeesShouldBe = ether(2).sub(marketFeesShouldBe);
		const sellerBalanceShouldBe = balanceAdaptAdmin1.add(sellerFeesShouldBe);

		console.log('balanceMarketFees2', balanceMarketFees2.toString(10));
		console.log('marketBalanceShouldBe', marketBalanceShouldBe.toString(10));

		console.log('balanceAdaptAdmin2', balanceAdaptAdmin2.toString(10));
		console.log('sellerBalanceShouldBe', sellerBalanceShouldBe.toString(10));

		balanceMarketFees2.should.be.bignumber.equal(marketBalanceShouldBe);
		balanceAdaptAdmin2.should.be.bignumber.equal(sellerBalanceShouldBe);
	});

	it('should not be able to take multiple orders if value is not enough', async () => {
		const balanceMarketFees1 = await pGetBalance(ac.MARKET_FEES_MSIG);
		const balanceAdaptAdmin1 = await pGetBalance(ac.ADAPT_ADMIN);

		const { logs } = await market.takeOrders(
			erc721Token.address,
			[ tokens[7], tokens[8] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1.99) }
		).should.be.rejectedWith(EVMRevert);


		const token7Status = await market.getOrderStatus(erc721Token.address, tokens[7]);
		assert.equal(token7Status, 1, 'The order should remain in \'Created\' state');

		const token8Status = await market.getOrderStatus(erc721Token.address, tokens[8]);
		assert.equal(token8Status, 1, 'The order should remain in \'Created\' state');
	});

	it('should return the token to the original owner on cancel', async () => {

		// approve ac.ACCOUNT3 to make transfers in the account of ac.BUYER1
		await erc721Token.setApprovalForAll(
			ac.ACCOUNT3,
			true,
			{ from: ac.BUYER1 }
		).should.be.fulfilled;

		await market.makeOrders(
			erc721Token.address,
			[ tokens[1] ],
			[ ether(1) ],
			{ from: ac.ACCOUNT3 , gas: 7000000 }
		).should.be.fulfilled;

		let ownerToken = await erc721Token.ownerOf(tokens[1]);
		assert.equal(ownerToken, market.address, 'MARKET should tmp own the token');

		const { logs } = await market.cancelOrders(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.ACCOUNT3 , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogOrdersCancelled');

		ownerToken = await erc721Token.ownerOf(tokens[1]);
		assert.equal(ownerToken, ac.BUYER1, 'the original owenr(ac.BUYER1) should tmp own the token');
	});
});


