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

contract('Testing token listing and updating - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	let token;
	let buyPrice;

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

	it('should mint a test token', async() => {

		await tokenErc721.mint(ac.ADAPT_ADMIN, 0, {
			from: ac.ADAPT_ADMIN
		}).should.be.fulfilled;

		token = await tokenErc721.tokenByIndex(0);
		buyPrice = ether(1);
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

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('ADAPT_ADMIN should be able to transfer his token to ACCOUNT1', async() => {

		const ret = await tokenErc721.transferFrom(
			ac.ADAPT_ADMIN,
			ac.ACCOUNT1,
			token,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'Transfer');
		const owner = await tokenErc721.ownerOf(token);
		assert.equal(owner, ac.ACCOUNT1, 'unexpected owner - ACCOUNT1 should own the token');
	});

	it('the SELLER should NOT be able to list a token for sale unless he gets approval', async () => {
		await market.create(
			tokenErc721.address,
			token,
			buyPrice,
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
		await market.create(
			tokenErc721.address,
			token,
			0,
			{
				from: ac.SELLER
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to list an erc721 token for sale', async () => {

		const ret = await market.create(
			tokenErc721.address,
			token,
			buyPrice,
			{
				from: ac.SELLER
			}
		).should.be.fulfilled;

		console.log(`GAS - List 1 token: ${ret.receipt.gasUsed}`);

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogCreate', {
			erc721: tokenErc721.address,
			tokenId: token,
			owner: ac.ACCOUNT1,
			seller: ac.SELLER,
			buyPrice: buyPrice
		});

		const owner = await tokenErc721.ownerOf(token);
		assert.equal(owner, market.address, 'unexpected owner - market should own the token');

		const info = await market.getOrderInfo(tokenErc721.address, token);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');

		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(buyPrice);
	});

	it('ADAPT_ADMIN should not be able to update an erc721 token listed by the SELLER', async() => {

		const ret = await market.update(
			tokenErc721.address,
			token,
			ether(2),
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to update an erc721 token listed by him', async() => {

		const ret = await market.update(
			tokenErc721.address,
			token,
			ether(2),
			{
				from: ac.SELLER
			}
		).should.be.fulfilled;

		const info = await market.getOrderInfo(tokenErc721.address, token);
		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');
		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(ether(2));
	});

	it('ACCOUNT1 should be able to update an erc721 token listed by the SELLER', async() => {

		const ret = await market.update(
			tokenErc721.address,
			token,
			ether(3),
			{
				from: ac.ACCOUNT1
			}
		).should.be.fulfilled;

		const info = await market.getOrderInfo(tokenErc721.address, token);
		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');
		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(ether(3));
	});
});
