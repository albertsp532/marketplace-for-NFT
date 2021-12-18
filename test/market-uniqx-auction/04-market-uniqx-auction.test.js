import {
	accounts,
	assert,
	BigNumber,
	getBalanceAsync
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
const moment = require('moment');
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import latestTime from '../helpers/latestTime';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing buy now - many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 10;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the erc721 token', async() => {

		console.log('Deploying the market contract...');

		market = await MarketUniqxAuction.new(
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
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should register the erc721 token', async() => {

		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG
			}
		).should.be.fulfilled;

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('ADAPT_ADMIN should allow the market to escrow his tokens', async() => {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});


	it('ADAPT_ADMIN should be able to list 10 erc721 tokens for auction', async () => {

		const threeDaysLater = latestTime() + duration.days(3);
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(1);
			startPrices[i] = ether(0.1);
			endTimes[i] = threeDaysLater;
		}

		const rec = await market.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy zero tokens', async() => {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.bidMany(
			tokenErc721.address,
			[],
			[],
			{
				from: ac.BUYER1,
				value: priceToPay
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the tokens - too much ether', async() => {
		const priceToPay = new BigNumber(ether(11));

		const ret = await market.bidMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			{
				from: ac.BUYER1,
				value: priceToPay
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy 10 tokens and transfer to fees to an updated collector', async () => {

		const futureCollectorAddress = ac.ACCOUNT1;
		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const futureMarketBalanceBefore = await getBalanceAsync(futureCollectorAddress);

		console.log(`ownerBalanceBefore: ${ownerBalanceBefore.toString(10)}`);
		console.log(`futureMarketBalanceBefore: ${futureMarketBalanceBefore.toString(10)}`);

		const marketFeeCollector = await market.MARKET_FEE_COLLECTOR.call();
		assert.equal(ac.MARKET_FEES_MSIG, marketFeeCollector, 'Unexpected market msig wallet');

		await market.setMarketFeeCollector(
			futureCollectorAddress,
			{
				from: ac.MARKET_ADMIN_MSIG
			}
		).should.be.fulfilled;

		const newMarketFeeCollector = await market.MARKET_FEE_COLLECTOR.call();
		assert.equal(futureCollectorAddress, newMarketFeeCollector, 'Unexpected market msig wallet');

		const priceToPay = new BigNumber(ether(10));

		const ret = await market.bidMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			{
				from: ac.BUYER1,
				value: priceToPay,
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(2 * tokens.length);
		for (let i = 0; i < tokens.length; i++) {
			await expectEvent.inLog(ret.logs[i*2], 'LogBid', {
				erc721: tokenErc721.address,
				tokenId: tokens[i],
				bidder: ac.BUYER1,
				bid: buyPrices[i]
			});
			await expectEvent.inLog(ret.logs[i*2 + 1], 'LogBuy', {
				erc721: tokenErc721.address,
				tokenId: tokens[i],
				buyer: ac.BUYER1,
			});
		}

		const marketFeeNum = await market.marketFeeNum.call();
		const marketFeeDen = await market.marketFeeDen.call();
		const feePercent = marketFeeNum.div(marketFeeDen);
		const marketFee = priceToPay.mul(feePercent);
		const ownerDue = priceToPay.minus(marketFee);

		console.log(`ownerDue: ${ownerDue}`);
		console.log(`marketFee: ${marketFee}`);

		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceAfter = await getBalanceAsync(futureCollectorAddress);

		console.log(`ownerBalanceAfter: ${ownerBalanceAfter.toString(10)}`);
		console.log(`marketBalanceAfter: ${marketBalanceAfter.toString(10)}`);

		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));
		marketBalanceAfter.should.be.bignumber.equal(futureMarketBalanceBefore.plus(marketFee));

		for (let token of tokens) {
			assert.equal(await tokenErc721.ownerOf(token), ac.BUYER1, 'unexpected owner  - should be buyer1');
		}
	});

	it('BUYER2 should not be able to buy the tokens - tokens already sold to buyer1', async() => {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.bidMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			{
				from: ac.BUYER2,
				value: priceToPay,
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
