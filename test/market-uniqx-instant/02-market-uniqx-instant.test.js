import {
	accounts,
	assert,
	BigNumber
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxInstant = artifacts.require('MarketUniqxInstant');

contract('Testing token listing - many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 10;
	let tokens = [];
	let buyPrices = [];

	it('should successfully deploy the market contract and the erc721 token', async() => {

		console.log('Deploying the market contract...');

		market = await MarketUniqxInstant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR
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

	it('should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(9);
		}
	});

	it('should register the erc721 token', async() => {

		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', {
			erc721: tokenErc721.address
		});

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});

	it('should not be able to list zero tokens', async() => {
		await market.createMany(
			tokenErc721.address,
			[],
			[],
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able to transfer one of the tokens to ACCOUNT1', async() => {

		const ret = await tokenErc721.transferFrom(
			ac.ADAPT_ADMIN,
			ac.ACCOUNT1,
			tokens[0],
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;

		// console.log(`ret: ${JSON.stringify(ret, null, '\t')}`);
		expectEvent.inLogs(ret.logs, 'Transfer');
		const owner = await tokenErc721.ownerOf(tokens[0]);
		assert.equal(owner, ac.ACCOUNT1, 'unexpected owner - ACCOUNT1 should own the token');
	});

	it('the SELLER should NOT be able to list 10 erc721 tokens for sale unless he gets approval', async () => {
		await market.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			{
				from: ac.SELLER
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ACCOUNT1 should be able to approve the SELLER to list his tokens', async() => {
		await tokenErc721.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ACCOUNT1
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the SELLER to list his tokens', async() => {
		await tokenErc721.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('ACCOUNT1 should be able to approve the MARKET escrow his tokens', async() => {
		// approve market to transfer all eerc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ACCOUNT1
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the MARKET escrow his tokens', async() => {
		// approve market to transfer all eerc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('the SELLER should not be able to list a zero value token', async() => {
		await market.createMany(
			tokenErc721.address,
			[tokens[0]],
			[0],
			{
				from: ac.SELLER
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to list 10 erc721 tokens for sale - fixed price', async () => {

		const ret = await market.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			{
				from: ac.SELLER
			}
		).should.be.fulfilled;

		//console.log(`@@@@ rec: ${JSON.stringify(ret, null, '\t')}`);

		console.log(`GAS - List ${tokensCount} erc721 tokens fixed price: ${ret.receipt.gasUsed}`);

		const owners = Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN);
		owners[0] = ac.ACCOUNT1;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: tokens,
			owners: owners,
			seller: ac.SELLER,
			buyPrices: buyPrices,
		});

		for (let i = 0; i < tokensCount; i++) {
			const owner = await tokenErc721.ownerOf(tokens[i]);
			assert.equal(owner, market.address, 'unexpected owner - market should own the token');

			const info = await market.getOrderInfo(tokenErc721.address, tokens[i]);
			//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

			assert.equal(info[0], i === 0 ? ac.ACCOUNT1 : ac.ADAPT_ADMIN, 'unexpected owner');

			const buyPrice = new BigNumber(info[1]);
			buyPrice.should.be.bignumber.equal(buyPrices[i]);
		}
	});
});
