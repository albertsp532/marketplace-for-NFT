import {
	accounts, assert, should, BigNumber, Bluebird
} from '../../common/common';
import ether from "../../helpers/ether";
import expectEvent from "../../helpers/expectEvent";
import EVMRevert from "../../../zeppelin/test/helpers/EVMRevert";


const UniqxMarketERC721Instant = artifacts.require("../../contracts/UniqxMarketERC721Instant.sol");
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

		market = await UniqxMarketERC721Instant.new(
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


		let rec = await market.registerContract(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'RegisterContract');

		rec = await market.registerContract(
			erc721Token2.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(rec.logs, 'RegisterContract');

		console.log("ERC721 contract " + market.address + " sucessfully registered");
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
		await market.makeOrders(
			erc721Token1.address,
			[ tokens1[0], tokens1[1], tokens1[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.makeOrders(
			erc721Token2.address,
			[ tokens2[0], tokens2[1], tokens2[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders per contract', async () => {
		const { logs } = await market.disallowContractOrders(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'DisallowContractOrders');
	});

	it('should not be able make orders for contract with orders disallowed', async () => {
		await market.makeOrders(
			erc721Token1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able take/cancel orders for contract with orders disallowed', async () => {
		let tokenStatus = await market.getOrderStatus(erc721Token1.address, tokens1[0]);
		assert.equal(tokenStatus, 1, 'Order should be in \'Created\' State');

		await market.takeOrders(
			erc721Token1.address,
			[ tokens1[0] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(1) }
		).should.be.fulfilled;

		tokenStatus = await market.getOrderStatus(erc721Token1.address, tokens1[0]);
		assert.equal(tokenStatus, 0, 'Order should be in \'Unknown\' State');

		await market.cancelOrders(
			erc721Token1.address,
			[ tokens1[1] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		tokenStatus = await market.getOrderStatus(erc721Token1.address, tokens1[1]);
		assert.equal(tokenStatus, 0, 'Order should be in \'Unknown\' State');
	});

	it('should be able make orders for other contracts with orders allowed', async () => {
		await market.makeOrders(
			erc721Token2.address,
			[ tokens2[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should not allow other than admin to disallow orders', async () => {
		await market.disallowContractOrders(
			erc721Token1.address,
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.disallowOrders(
			{ from: ac.BUYER1 , gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to allow orders per contract', async () => {
		const { logs } = await market.allowContractOrders(
			erc721Token1.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'AllowContractOrders');
	});

	it('should be able make orders for contract with allowed orders', async () => {
		await market.makeOrders(
			erc721Token1.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders for all contacts', async () => {
		const { logs } = await market.disallowOrders({from: ac.MARKET_ADMIN_MSIG}
		).should.be.fulfilled;

		await expectEvent.inLogs(logs, 'DisallowOrders');
	});

	it('should not be able make orders for any contracts when orders are disallowed globally', async () => {
		await market.makeOrders(
			erc721Token1.address,
			[ tokens1[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

		await market.makeOrders(
			erc721Token2.address,
			[ tokens2[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN, gas: 7000000 }
		).should.be.rejectedWith(EVMRevert);

	});

	it('should be able take/cancel/change orders for contract when orders are disallowed globally', async () => {
		await market.changeOrders(
			erc721Token1.address,
			[ tokens1[2] ],
			[ ether(2.5) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.takeOrders(
			erc721Token1.address,
			[ tokens1[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(2.5) }
		).should.be.fulfilled;

		await market.cancelOrders(
			erc721Token1.address,
			[ tokens1[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.changeOrders(
			erc721Token2.address,
			[ tokens2[2] ],
			[ ether(2.5) ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		await market.takeOrders(
			erc721Token2.address,
			[ tokens2[2] ],
			{ from: ac.BUYER2 , gas: 7000000, value: ether(2.5) }
		).should.be.fulfilled;

		await market.cancelOrders(
			erc721Token2.address,
			[ tokens2[3] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;
	});
});


