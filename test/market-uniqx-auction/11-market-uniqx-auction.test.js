import { accounts, BigNumber } from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import latestTime from '../helpers/latestTime';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing the requires - ', function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let tokenErc721, market;
	let tokensCount = 10;
	let tokens = [];
	let prices = [];

	it('should be able to deploy the smart contracts', async () => {

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;
		
		console.log("ERC721 test contracts deployed at addresses ", tokenErc721.address);

		let rec = await market.registerToken(
			tokenErc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });
	});

	it('should be able to mass mint new tokens', async() => {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should be able to enable the market to transfer tokens', async() => {
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			console.log('token: ', tokens[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('createMany - check if each require throws', async () => {
		const threeDaysLater = latestTime() + duration.days(3);

		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.createMany(
			tokenErc721.address,
			[ ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == buyPrices.length, "Array lengths must match");
		await market.createMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == startPrices.length, "Array lengths must match");
		await market.createMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == endTimes.length, "Array lengths must match");
		await market.createMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(startPrice <= buyPrice, "Start price must be less than or equal to the buy price");
		await market.createMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ ether(1), ether(1), ether(1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// canBeStoredWith128Bits(startPrice)
		const greaterThanUInt128 = new BigNumber('340282366920938463463374607431768211456');
		await market.createMany(
			tokenErc721.address,
			[ tokens[5] ],
			[ greaterThanUInt128 ],
			[ ether(1) ],
			[ threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// canBeStoredWith128Bits(buyPrice)
		await market.createMany(
			tokenErc721.address,
			[ tokens[5] ],
			[ ether(0.1) ],
			[ greaterThanUInt128 ],
			[ threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// canBeStoredWith64Bits(endTime)
		const greaterThanUInt64 = new BigNumber('18446744073709551616');
		await market.createMany(
			tokenErc721.address,
			[ tokens[5] ],
			[ ether(0.1) ],
			[ ether(1) ],
			[ greaterThanUInt64 ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('updateMany - check if each require throws', async () => {
		const threeDaysLater = latestTime() + duration.days(3);

		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.updateMany(
			tokenErc721.address,
			[ ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == buyPrices.length, "Array lengths must match");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == startPrices.length, "Array lengths must match");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == endTimes.length, "Array lengths must match");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1), ether(1) ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(orderExists(order), "Token must be listed");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			[ ether(1), ether(1), ether(1) ],
			[ threeDaysLater, threeDaysLater, threeDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		await market.create(
			tokenErc721.address,
			tokens[4],
			ether(1),
			ether(0.1),
			threeDaysLater,
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		// require(newStartPrice <= newBuyPrice, "Start price must be less than or equal to the buy price");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[4] ],
			[ ether(0.2) ],
			[ ether(1) ],
			[ threeDaysLater ],
			{ from: ac.ACCOUNT1  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('bidMany - check if each require throws', async () => {
		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.bidMany(
			tokenErc721.address,
			[ ],
			[ ether(1) ],
			{from: ac.BUYER1}
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == bids.length, "Array lengths must match");
		await market.bidMany(
			tokenErc721.address,
			[tokens[0], tokens[1] ],
			[ ether(1) ],
			{from: ac.BUYER1}
		).should.be.rejectedWith(EVMRevert);
	});

	it('complete - check if require throws', async () => {
		// require(orderExists(order), "Token must be listed");
		await market.complete(
			tokenErc721.address,
			tokens[0],
			{from: ac.ADAPT_ADMIN}
		).should.be.rejectedWith(EVMRevert);
	});

	it('cancelMany - check if each require throws', async () => {
		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.cancelMany(
			tokenErc721.address,
			[ ],
			{from: ac.ADAPT_ADMIN}
		).should.be.rejectedWith(EVMRevert);
	});

	it('cancel - check if each require throws', async () => {
		// require(orderExists(order), "Token must be listed");
		await market.cancel(
			tokenErc721.address,
			tokens[1],
			{from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);

		// require(msg.sender == order.owner || tokenInstance.isApprovedForAll(order.owner, msg.sender),
		// 			"Only the owner or the seller can cancel an order");
		await market.cancel(
			tokenErc721.address,
			tokens[4],
			{from: ac.ACCOUNT1 }
		).should.be.rejectedWith(EVMRevert);

		// require(now < order.endTime, "Auction must be open");
		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));
		await market.cancel(
			tokenErc721.address,
			tokens[4],
			{from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);
	});
});


