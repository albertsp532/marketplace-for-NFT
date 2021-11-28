import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxInstant = artifacts.require('../../contracts/MarketUniqxInstant.sol');

contract('testing allow/disallow orders - ', function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let tokenAdapt1, tokenAdapt2, market;
	let tokesCount = 10;
	let tokens1 = [];
	let tokens2 = [];
	let prices = [];

	it('should be able to deploy the smart contracts', async () => {

		market = await MarketUniqxInstant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		tokenAdapt1 = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		tokenAdapt2 = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log("ERC721 test contracts deployed at addresses " + tokenAdapt1.address + tokenAdapt2.address);


		let rec = await market.registerToken(
			tokenAdapt1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'LogRegisterToken');

		rec = await market.registerToken(
			tokenAdapt2.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogRegisterToken');
	});

	it('should be able to mass mint new tokens', async function () {
		await tokenAdapt1.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await tokenAdapt2.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to enable the market to transfer tokens', async function () {
		for (let i = 0; i < tokesCount; i++) {
			tokens1[i] = await tokenAdapt1.tokenByIndex(i);
			tokens2[i] = await tokenAdapt2.tokenByIndex(i);
			console.log('token: ', tokens1[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await tokenAdapt1.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await tokenAdapt2.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make orders by default', async () => {
		await market.createMany(
			tokenAdapt1.address,
			[ tokens1[0], tokens1[1], tokens1[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.createMany(
			tokenAdapt2.address,
			[ tokens2[0], tokens2[1], tokens2[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders per contract', async () => {
		const { logs } = await market.disableTokenOrders(
			tokenAdapt1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogDisableTokenOrders');
	});

	it('should not be able make orders for contract with orders disallowed', async () => {
		await market.createMany(
			tokenAdapt1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able take/cancel orders for contract with orders disallowed', async () => {
		let listed = await market.tokenIsListed(tokenAdapt1.address, tokens1[0]);
		assert.equal(listed, true, 'Token should be listed');

		await market.buyMany(
			tokenAdapt1.address,
			[ tokens1[0] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		listed = await market.tokenIsListed(tokenAdapt1.address, tokens1[0]);
		assert.equal(listed, false, 'Token should not be listed');

		await market.cancelMany(
			tokenAdapt1.address,
			[ tokens1[1] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		listed = await market.tokenIsListed(tokenAdapt1.address, tokens1[1]);
		assert.equal(listed, false, 'Token should not be listed');
	});

	it('should be able make orders for other contracts with orders allowed', async () => {
		await market.createMany(
			tokenAdapt2.address,
			[ tokens2[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should not allow other than admin to disallow orders', async () => {
		await market.disableTokenOrders(
			tokenAdapt1.address,
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.disableOrders(
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to allow orders per contract', async () => {
		const { logs } = await market.enableTokenOrders(
			tokenAdapt1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogEnableTokenOrders');
	});

	it('should be able make orders for contract with allowed orders', async () => {
		await market.createMany(
			tokenAdapt1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders for all contacts', async () => {
		const { logs } = await market.disableOrders({from: ac.MARKET_ADMIN_MSIG}
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'LogDisableOrders');
	});

	it('should not be able make orders for any contracts when orders are disallowed globally', async () => {
		await market.createMany(
			tokenAdapt1.address,
			[ tokens1[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.createMany(
			tokenAdapt2.address,
			[ tokens2[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

	});

	it('should be able take/cancel orders for contract when orders are disallowed globally', async () => {
		await market.buyMany(
			tokenAdapt1.address,
			[ tokens1[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		await market.cancelMany(
			tokenAdapt1.address,
			[ tokens1[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.buyMany(
			tokenAdapt2.address,
			[ tokens2[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		await market.cancelMany(
			tokenAdapt2.address,
			[ tokens2[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});
});
