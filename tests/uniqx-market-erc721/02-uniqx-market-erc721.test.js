import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";


const UniqxMarketERC721 = artifacts.require('../../contracts/UniqxMarketERC721.sol');
const erc721Token = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");

contract('testing allow/disallow orders - ', function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let erc721Token1, erc721Token2, market;
	let tokesCount = 10;
	let tokens1 = [];
	let tokens2 = [];
	let prices = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the smart contracts', async () => {

		market = await UniqxMarketERC721.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		erc721Token1 = await erc721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		erc721Token2 = await erc721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("ERC721 test contracts deployed at addresses " + erc721Token1.address + erc721Token2.address);


		let rec = await market.registerToken(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'LogTokenRegistered');

		rec = await market.registerToken(
			erc721Token2.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogTokenRegistered');
	});

	it('should be able to mass mint new tokens', async function () {
		await erc721Token1.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await erc721Token2.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to enable the market to transfer tokens', async function () {
		for (let i = 0; i < tokesCount; i++) {
			tokens1[i] = await erc721Token1.tokenByIndex(i);
			tokens2[i] = await erc721Token2.tokenByIndex(i);
			console.log('token: ', tokens1[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await erc721Token1.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await erc721Token2.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make orders by default', async () => {
		await market.listTokensFixedPrice(
			erc721Token1.address,
			[ tokens1[0], tokens1[1], tokens1[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.listTokensFixedPrice(
			erc721Token2.address,
			[ tokens2[0], tokens2[1], tokens2[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders per contract', async () => {
		const { logs } = await market.disableTokenOrders(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokenOrdersDisabled');
	});

	it('should not be able make orders for contract with orders disallowed', async () => {
		await market.listTokensFixedPrice(
			erc721Token1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able take/cancel orders for contract with orders disallowed', async () => {
		let orderStatus = await market.getOrderStatus(erc721Token1.address, tokens1[0]);
		assert.equal(orderStatus, OrderStatus.Listed, 'Order should be in \'Listed\' State');

		await market.buyTokens(
			erc721Token1.address,
			[ tokens1[0] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		orderStatus = await market.getOrderStatus(erc721Token1.address, tokens1[0]);
		assert.equal(orderStatus, OrderStatus.Unknown, 'Order should be in `Unknown` state');

		await market.cancelTokens(
			erc721Token1.address,
			[ tokens1[1] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		orderStatus = await market.getOrderStatus(erc721Token1.address, tokens1[1]);
		console.log('@@ Order status token 1', orderStatus);
		assert.equal(orderStatus, OrderStatus.Unknown, 'Order should be in `Unknown` state');
	});

	it('should be able make orders for other contracts with orders allowed', async () => {
		await market.listTokensFixedPrice(
			erc721Token2.address,
			[ tokens2[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should not allow other than admin to disallow orders', async () => {
		await market.disableTokenOrders(
			erc721Token1.address,
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.disableOrders(
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to allow orders per contract', async () => {
		const { logs } = await market.enableTokenOrders(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogTokenOrdersEnabled');
	});

	it('should be able make orders for contract with allowed orders', async () => {
		await market.listTokensFixedPrice(
			erc721Token1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders for all contacts', async () => {
		const { logs } = await market.disableOrders({from: ac.MARKET_ADMIN_MSIG}
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogOrdersDisabled');
	});

	it('should not be able make orders for any contracts when orders are disallowed globally', async () => {
		await market.listTokensFixedPrice(
			erc721Token1.address,
			[ tokens1[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.listTokensFixedPrice(
			erc721Token2.address,
			[ tokens2[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

	});

	it('should be able take/cancel orders for contract when orders are disallowed globally', async () => {
		await market.buyTokens(
			erc721Token1.address,
			[ tokens1[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		await market.cancelTokens(
			erc721Token1.address,
			[ tokens1[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.buyTokens(
			erc721Token2.address,
			[ tokens2[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		await market.cancelTokens(
			erc721Token2.address,
			[ tokens2[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});
});


