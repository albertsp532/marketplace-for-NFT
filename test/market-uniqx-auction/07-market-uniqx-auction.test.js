import {
	accounts,
	assert,
	BigNumber,
	getBalanceAsync,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from '../helpers/latestTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing buy now - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	let token;
	let buyPrice;
	let startPrice;
	let endTime;

	it('should successfully deploy the market contract and the erc721 token', async() => {

		console.log('Deploying the market contract...');

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
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
		buyPrice = ether(10);
		startPrice = ether(1);
		endTime = latestTime() + duration.days(3);
	});

	it('should register the erc721 token', async() => {

		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async() => {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list a token', async () => {

		const rec = await market.create(
			tokenErc721.address,
			token,
			buyPrice,
			startPrice,
			endTime,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy the tokens - too much ether', async() => {
		const priceToPay = new BigNumber(ether(11));

		const ret = await market.bid(
			tokenErc721.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy a token', async () => {

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.bid(
			tokenErc721.address,
			token,
			{
				from: ac.BUYER1,
				value: priceToPay,
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(2);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: token,
			bidder: ac.BUYER1,
			bid: priceToPay
		});
		await expectEvent.inLog(ret.logs[1], 'LogBuy', {
			erc721: tokenErc721.address,
			tokenId: token,
			buyer: ac.BUYER1
		});

		const marketFeeNum = await market.marketFeeNum.call();
		const marketFeeDen = await market.marketFeeDen.call();
		const feePercent = marketFeeNum.div(marketFeeDen);
		const marketFee = priceToPay.mul(feePercent);
		const ownerDue = priceToPay - marketFee;

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);

		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		assert.equal(await tokenErc721.ownerOf(token), ac.BUYER1, 'unexpected owner  - should be buyer1');
	});

	it('BUYER2 should not be able to buy a token - token already sold to buyer1', async() => {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.bid(
			tokenErc721.address,
			token,
			{
				from: ac.BUYER2,
				value: priceToPay,
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
