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

contract('Testing the requires - ', function (rpc_accounts) {

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
			buyPrices[i] = ether(2);
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

	it('should be able to enable the market to transfer tokens', async() => {
		// approve market to transfer all eerc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('createMany - check if each require throws', async () => {
		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.createMany(
			tokenErc721.address,
			[],
			[ether(1), ether(1), ether(1)],
			{from: ac.ADAPT_ADMIN}
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == buyPrices.length, "Array lengths must match");
		await market.createMany(
			tokenErc721.address,
			[tokens[0], tokens[1], tokens[2]],
			[ether(1), ether(1)],
			{from: ac.ADAPT_ADMIN}
		).should.be.rejectedWith(EVMRevert);
	});

	it('updateMany - check if each require throws', async () => {
		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.updateMany(
			tokenErc721.address,
			[ ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(tokenIds.length == buyPrices.length, "Array lengths must match");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		// require(orderExists(order), "Token must be listed");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[0], tokens[1], tokens[2] ],
			[ ether(0.1), ether(0.1), ether(0.1) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);

		await market.create(
			tokenErc721.address,
			tokens[3],
			ether(1),
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		// require(newPrice > 0, "The new price must be greater than zero");
		await market.updateMany(
			tokenErc721.address,
			[ tokens[3] ],
			[ ether(0) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('cancelMany - check if each require throws', async () => {
		// require(tokenIds.length > 0, "Array must have at least one entry");
		await market.cancelMany(
			tokenErc721.address,
			[],
			{from: ac.ADAPT_ADMIN}
		).should.be.rejectedWith(EVMRevert);
	});

	it('create - check if each require throws', async () => {
		// require(!orderExists(order), "Token must not be listed already");
		await market.create(
			tokenErc721.address,
			tokens[3],
			ether(1),
			{ from: ac.ADAPT_ADMIN  }
		).should.be.rejectedWith(EVMRevert);
	});
});
