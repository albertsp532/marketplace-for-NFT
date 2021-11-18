import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";

const UniqxMarketERC721Instant = artifacts.require("../../../contracts/UniqxMarketERC721Instant.sol");
const ERC721Token = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('estimate gas - ', function (rpc_accounts) {

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
	});

	it('should be able to register a contract', async () => {

		erc721Token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		const rec = await market.registerContract(
			erc721Token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'RegisterContract');

		console.log('registerContract() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to disable new orders on a contract', async () => {
		const token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		await market.registerContract(
			token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		const rec = await market.disallowContractOrders(
			token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'DisallowContractOrders');

		console.log('disallowContractOrders() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to disallow orders', async () => {
		const rec = await market.disallowOrders({from: ac.MARKET_ADMIN_MSIG}
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'DisallowOrders');

		console.log('disallowOrders() - Gas Used = ' + rec.receipt.gasUsed);
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
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await erc721Token.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to allow orders', async () => {
		const rec = await market.allowOrders({ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'AllowOrders');

		console.log('allowOrders() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to make a single order', async () => {
		const rec = await market.makeOrders(
			erc721Token.address,
			[ tokens[0] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log('makeOrders() with 1 order - Gas Used = ' + rec.receipt.gasUsed);

		expectEvent.inLogs(rec.logs, 'LogOrdersCreated');

		const orderStatus = await market.getOrderStatus(erc721Token.address, tokens[0]);
		assert.equal(orderStatus, OrderStatus.Published);
	});

	it('should be able to cancel order', async () => {
		const rec = await market.cancelOrders(
			erc721Token.address,
			[ tokens[0] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		const orderStatus = await market.getOrderStatus(erc721Token.address, tokens[0]);
		assert.equal(orderStatus, OrderStatus.Cancelled);

		const event = rec.logs.find(e => e.event === 'LogOrdersCreated');
		await expectEvent.inLogs(rec.logs, 'LogOrdersCancelled');

		console.log('cancelOrders() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to make multiple orders in one transaction', async () => {
		const rec = await market.makeOrders(
			erc721Token.address,
			tokens,
			prices,
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'LogOrdersCreated');

		for (let i = 0; i < tokens.length; i++) {
			const orderStatus = await market.getOrderStatus(erc721Token.address, tokens[i]);
			assert.equal(orderStatus, OrderStatus.Published);
		}

		console.log('makeOrders() with 10 orders - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to take order', async () => {
		const rec = await market.takeOrders(
			erc721Token.address,
			[ tokens[1] ],
			{ from: ac.BUYER1 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		console.log('takeOrders() - Gas Used = ' + rec.receipt.gasUsed);

		await expectEvent.inLogs(rec.logs, 'LogOrderAcquired');
		const orderStatus = await market.getOrderStatus(erc721Token.address, tokens[1]);
		assert.equal(orderStatus, OrderStatus.Acquired);
	});


	it('should be able to change an order', async () => {
		const rec = await market.changeOrders(
			erc721Token.address,
			[ tokens[2] ],
			[ 2 ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		const orderInfo = await market.getOrderInfo(erc721Token.address, tokens[2]);

		await expectEvent.inLogs(rec.logs, 'LogOrdersChanged');

		orderInfo[0].should.be.bignumber.equal(1); // 'Created' status
		orderInfo[1].should.be.bignumber.equal(2);  // price

		console.log('changeOrders() - Gas Used = ' + rec.receipt.gasUsed);
	});

	it('should be able to change the market fee', async () => {
		const rec = await market.setPercentageFee(
			275, // set the fee to 2.75%
			1000,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'SetPercentageFee');

		console.log('setPercentageFee() - Gas Used = ' + rec.receipt.gasUsed);
	});
});


