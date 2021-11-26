const moment = require('moment');
const Bluebird = require('bluebird');
const BigNumber = web3.BigNumber;
const assert = require('chai').assert;
const should = require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OrderStatus = {
	Unknown:    0,
	Listed:     1,
	Reserved:   2,
	Cancelled:  3,
	Sold:       4,
	Unsold:     5,
};

export function accounts(rpc_accounts) {
	return {
		OPERATOR: rpc_accounts[0],
		MARKET_ADMIN_MSIG: rpc_accounts[1],
		MARKET_FEES_MSIG: rpc_accounts[2],
		ADAPT_OWNER: rpc_accounts[3],
		ADAPT_ADMIN: rpc_accounts[4],
		SELLER: rpc_accounts[5],
		BUYER1: rpc_accounts[6],
		BUYER2: rpc_accounts[7],
		BUYER3: rpc_accounts[8],
		ACCOUNT1: rpc_accounts[9],
		ACCOUNT2: rpc_accounts[10],
		ACCOUNT3: rpc_accounts[11],
	};
}

export function printTime(timestamp) {
	console.log('Timestamp is: ', JSON.stringify(timestamp));
	console.log('Time is: ', moment.unix(timestamp).utc().format());
}

const getBalanceAsync = Bluebird.promisify(web3.eth.getBalance);

export async function getBalanceAsyncStr(address, base = 10) {
	return (await getBalanceAsync(address)).toString(base);
}

async function parseAdaptTokenEvent(event) {

	//console.log(JSON.stringify(event, null, '\t'));

	const name = event['name'];

	// we are only interested in transfer events
	if (name !== 'Transfer') {
		console.log(`Skipping event ${name}...`);
		return;
	}

	const parameters = event['events']; // it's called events for some reason...
	const from       = parameters[0].value;
	const to         = parameters[1].value;
	const tokenId    = new BigNumber(parameters[2].value, 10);

	if (from === '0x0000000000000000000000000000000000000000') {
		// this is the initial transfer, right after mint
		console.log(`Token 0x${tokenId.toString(16)} minted! Owner is: ${to}`);
	} else {
		console.log(`Token 0x${tokenId.toString(16)} transferred from: ${from} to: ${to}`);
	}
}

async function parseAdaptMarketEvent(event, timestamp) {

	// console.log(JSON.stringify(event, null, '\t'));

	const name = event['name'];
	const parameters = event['events']; // it's called events for some reason...

	switch (name) {
		case 'LogTokensListed': {

			const tokenIds      = parameters[0].value;
			const buyPrices     = parameters[1].value;
			const reservations  = parameters[2].value;
			const owners        = parameters[3].value;
			const seller        = parameters[4].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Listed: tokenId=0x${tokenId}, buyPrices=${buyPrices[i]}, reservation=${reservations[i]}, owner=${owners[i]}, seller=${seller}, listedAt=${moment.unix(timestamp).utc().format()}`);
			}
			break;
		}

		case 'LogTokensCancelled': {
			const tokenIds      = parameters[0].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Canceled: tokenId=0x${tokenId}, cancelledAt=${moment.unix(timestamp).utc().format()}`);
			}
			break;
		}

		case 'LogTokenSold': {
			const tokenId       = new BigNumber(parameters[0].value, 10).toString(16);
			const buyer         = parameters[1].value;
			const price         = parameters[2].value;
			console.log(`Token Sold: tokenId=0x${tokenId}, buyer=${buyer}, price=${price}, soldAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		default:
			console.log(`Skipping event ${name}...`);
	}
}

async function parseUniqxInstantMarketEvent(event, timestamp) {

	//console.log(JSON.stringify(event, null, '\t'));

	const name = event['name'];
	const parameters = event['events']; // it's called events for some reason...

	switch (name) {

		case 'LogTokenListed': {

			const token        = parameters[0].value;
			const tokenId      = parameters[1].value;
			const owner        = parameters[2].value;
			const seller       = parameters[3].value;
			const buyPrice     = parameters[4].value;

			console.log(`Token Listed FixedPrice: 
				token=${token}, 
				tokenId=0x${new BigNumber(tokenId, 10).toString(16)}, 
				listedAt=${moment.unix(timestamp).utc().format()}, 
				owner=${owner}, 
				seller=${seller}, 
				buyPrices=${buyPrice}
			`);
			break;
		}

		case 'LogTokensListed': {

			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const owners        = parameters[2].value;
			const seller        = parameters[3].value;
			const buyPrices     = parameters[4].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Listed FixedPrice: token=${token}, tokenId=0x${tokenId}, listedAt=${moment.unix(timestamp).utc().format()}, owner=${owners[i]}, seller=${seller}, buyPrices=${buyPrices[i]}`);
			}
			break;
		}

		case 'LogTokenSold': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value, 10).toString(16);
			const buyer         = parameters[2].value;
			console.log(`Token Sold: token=${token}, tokenId=0x${tokenId}, buyer=${buyer}, soldAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		case 'LogTokensSold': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const buyer         = parameters[2].value;
			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Sold: token=${token}, tokenId=0x${tokenId}, buyer=${buyer}, soldAt=${moment.unix(timestamp).utc().format()}`);
			}
			break;
		}

		case 'LogTokenCancelled': {
			const token   = parameters[0].value;
			const tokenId = new BigNumber(parameters[1].value, 10).toString(16);
			console.log(`Token Canceled: token=${token}, tokenId=0x${tokenId}, cancelledAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		case 'LogTokensCancelled': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Canceled: token=${token}, tokenId=0x${tokenId}, cancelledAt=${moment.unix(timestamp).utc().format()}`);
			}
			break;
		}

		default:
			console.log(`Skipping event ${name}...`);
	}
}


async function parseUniqxAuctionMarketEvent(event, timestamp) {

	//console.log(JSON.stringify(event, null, '\t'));

	const name = event['name'];
	const parameters = event['events']; // it's called events for some reason...

	switch (name) {

		case 'LogTokensListed': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const owners        = parameters[2].value;
			const seller        = parameters[3].value;
			const buyPrices     = parameters[4].value;
			const endPrices     = parameters[5].value;
			const endTimes      = parameters[6].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Listed Auction: token=${token}, tokenId=0x${tokenId}, listedAt=${moment.unix(timestamp).utc().format()}, owner=${owners[i]}, seller=${seller}, buyPrices=${buyPrices[i]}, endPrice=${endPrices[i]}, endTime=${moment.unix(endTimes[i]).utc().format()}`);
			}
			break;
		}

		case 'LogBidPlaced': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value, 10).toString(16);
			const bidder        = parameters[2].value;
			const bid           = parameters[3].value;
			console.log(`Bid Placed : token=${token}, tokenId=0x${tokenId}, bidder=${bidder}, bid=${bid}, bidPlacedAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		case 'LogTokenSold': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value, 10).toString(16);
			const buyer         = parameters[2].value;
			const price         = parameters[3].value;
			console.log(`Token Sold: token=${token}, tokenId=0x${tokenId}, buyer=${buyer}, price=${price}, soldAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		case 'LogTokenUnsold': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value, 10).toString(16);
			console.log(`Token Unsold: token=${token}, tokenId=0x${tokenId}, unsoldAt=${moment.unix(timestamp).utc().format()}`);
			break;
		}

		case 'LogTokensCancelled': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i], 10).toString(16);
				console.log(`Token Canceled: token=${token}, tokenId=0x${tokenId}, cancelledAt=${moment.unix(timestamp).utc().format()}`);
			}
			break;
		}

		default:
			console.log(`Skipping event ${name}...`);
	}
}

module.exports = {
	accounts: accounts,
	BigNumber: BigNumber,
	Bluebird: Bluebird,
	assert: assert,
	should: should,
	OrderStatus: OrderStatus,
	getBalanceAsync: getBalanceAsync,
	getBalanceAsyncStr: getBalanceAsyncStr,
	parseAdaptTokenEvent: parseAdaptTokenEvent,
	parseAdaptMarketEvent: parseAdaptMarketEvent,
	parseUniqxInstantMarketEvent: parseUniqxInstantMarketEvent,
	parseUniqxAuctionMarketEvent: parseUniqxAuctionMarketEvent
};
