import {
	accounts,
	assert,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxInstant = artifacts.require('MarketUniqxInstant');

contract('Testing cancel functionality - single', async function (rpc_accounts) {

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

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async() => {
		// approve market to transfer all eerc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list a token for sale', async () => {

		token = await tokenErc721.tokenByIndex(0);
		buyPrice = ether(10);

		const rec = await market.create(
			tokenErc721.address,
			token,
			buyPrice,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('ACCOUNT1 should not be able to cancel a token - ADAPT_ADMIN owns the token', async () => {

		const ret = await market.cancel(
			tokenErc721.address,
			token,
			{
				from: ac.ACCOUNT1
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able to cancel a token', async () => {

		const ret = await market.cancel(
			tokenErc721.address,
			token,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogCancel', {
			erc721: tokenErc721.address,
			tokenId: token
		});


		const owner = await tokenErc721.ownerOf(token);
		assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner - should be ADAPT_ADMIN');
	});

	it('ADAPT_ADMIN should be able to re-list a canceled token', async () => {

		token = await tokenErc721.tokenByIndex(0);
		buyPrice = ether(10);

		const rec = await market.create(
			tokenErc721.address,
			token,
			buyPrice,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should be able to buy the token', async () => {
		const ret = await market.buy(
			tokenErc721.address,
			token,
			{
				from: ac.BUYER1,
				value: ether(10)
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should not be able to cancel a token - was sold already', async () => {
		const ret = await market.cancel(
			tokenErc721.address,
			token,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
