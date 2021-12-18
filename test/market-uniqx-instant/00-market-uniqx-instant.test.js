import {
	accounts,
	assert,
	BigNumber,
	getBalanceAsync,
	getBalanceAsyncStr,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import latestTime from '../helpers/latestTime';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import { duration } from 'openzeppelin-solidity/test/helpers/increaseTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxInstant = artifacts.require('MarketUniqxInstant');

contract('Testing FixedPrice listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 11;
	let tokens = [];
	let prices = [];

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
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount - 1; i++) {
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

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', {
			erc721: tokenErc721.address
		});

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('should allow the market to escrow the erc721 tokens', async() => {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;
	});


	it('should be able to list 10 erc721 tokens for sale - fixed price', async () => {

		for (let i = 0; i < tokensCount - 1; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			prices[i] = ether(1);
		}

		const rec = await market.createMany(
			tokenErc721.address,
			tokens,
			prices,
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;

		console.log(`GAS - List ${tokensCount - 1} erc721 tokens - fixed price: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: tokens,
			owners: Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN),
			seller: ac.ADAPT_ADMIN,
			buyPrices: prices,
		});
	});

	it('should mint 1 test token', async() => {

		const ret = await tokenErc721.mint(ac.ADAPT_ADMIN, 10, {
			from: ac.ADAPT_ADMIN
		}).should.be.fulfilled;
	});

	it('should be able to list 1 token - fixed price', async () => {

		tokens[10] = await tokenErc721.tokenByIndex(10);
		prices[10] = ether(1);

		let rec = await market.create(
			tokenErc721.address,
			tokens[10],
			prices[10],
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		console.log(`GAS - List 1 erc721 token - fixed price: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreate', {
			erc721: tokenErc721.address,
			tokenId: tokens[10],
			owner: ac.ADAPT_ADMIN,
			seller: ac.ADAPT_ADMIN,
			buyPrice: prices[10]
		});
	});

	it('should be able to cancel 2 tokens', async () => {

		const balance1 = await getBalanceAsyncStr(ac.MARKET_FEES_MSIG);
		const rec = await market.cancelMany(
			tokenErc721.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN
			}
		).should.be.fulfilled;

		console.log(`GAS - Cancel 2 erc721 tokens: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCancelMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0], tokens[1] ]
		});

		const balance2 = await getBalanceAsyncStr(ac.MARKET_FEES_MSIG);
		balance2.should.be.bignumber.equal(balance1);
		console.log(`Market balance: ${balance2}`);
	});

	it('should be able to re-list 1 token after cancelled', async () => {

		const fourDaysLater = latestTime() + duration.days(4);

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[0] ],
			[ prices[0] ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		console.log(`GAS - Re-list for fixed price 1 erc721 token after it was cancel: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ prices[0] ]
		});
	});

	it('should be able to buy 9 tokens', async () => {

		const tokensToBuy = tokens.slice(2);
		//console.log(`Tokens to buy: ${JSON.stringify(tokensToBuy)}`);
		const priceToPay = new BigNumber(ether(9));
		const marketFee = priceToPay.dividedToIntegerBy(100);
		const ownerDue = priceToPay - marketFee;

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		console.log(`priceToPay: ${priceToPay.toString(10)}`);
		console.log(`marketFee: ${marketFee.toString(10)}`);
		console.log(`ownerDue: ${ownerDue.toString(10)}`);
		console.log(`ownerBalanceBefore: ${ownerBalanceBefore.toString(10)}`);
		console.log(`marketBalanceBefore: ${marketBalanceBefore.toString(10)}`);

		const ret = await market.buyMany(
			tokenErc721.address,
			tokensToBuy,
			{
				from: ac.BUYER1,
				value: priceToPay
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBuyMany', {
			erc721: tokenErc721.address,
			tokenIds: tokensToBuy,
			buyer: ac.BUYER1,
		});

		for (let token of tokensToBuy) {
			const owner = await tokenErc721.ownerOf(token);
			assert.equal(owner, ac.BUYER1, 'owner should be buyer1');
		}

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));

		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);
		console.log(`GAS - Buy 9 erc721 tokens: ${ret.receipt.gasUsed}`);
	});


	it('Market msig be able to set the percentage cut for the market', async() => {
		const rec = await market.setMarketFee(
			2,
			100,
			{
				from: ac.MARKET_ADMIN_MSIG
			}
		).should.be.fulfilled;

		const marketFeeNum = await market.marketFeeNum.call();
		const marketFeeDen = await market.marketFeeDen.call();

		assert.equal(marketFeeNum, 2, 'Unexpected fee numerator');
		assert.equal(marketFeeDen, 100, 'Unexpected fee denominator');
	});

	it('should not allow other than market msig to set the percentage cut for the market', async() => {
		const rec = await market.setMarketFee(
			3,
			100,
			{
				from: ac.BUYER1
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('should not allow other than market msig to change the msig address', async() => {
		const rec = await market.setMarketFeeCollector(
			ac.BUYER1,
			{
				from: ac.BUYER1
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('sending ether to contract should fail', async() => {
		await market.send(ether(1)).should.be.rejectedWith(EVMRevert);
	});
});
