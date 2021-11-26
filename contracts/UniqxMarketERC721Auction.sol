pragma solidity ^0.4.24;

import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";
import {UniqxMarketBase} from "./UniqxMarketBase.sol";

contract UniqxMarketERC721Auction is UniqxMarketBase
{
	using SafeMath for uint;

	/////////////////////////////////////// CONSTANTS ///////////////////////////////////////
	uint constant AUCTION_MIN_DURATION = 1 hours;
	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	struct OrderInfo {
		address owner; 				// the user who owns the token sold via this order
		uint buyPrice;				// holds the 'buy it now' price
		address buyer;				// holds the address of the buyer or the address of the highest bidder
		uint startPrice; 			// holds the start price of an auction
		uint endTime;				// holds the time when the auction ends
		uint highestBid; 			// holds the highest bid at any given time
	}

	/////////////////////////////////////// EVENTS //////////////////////////////////////////
	event LogTokensListed(
		address token,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);
	event LogBidPlaced(address token, uint tokenId, address bidder, uint bid);
	event LogTokenSold(address token, uint tokenId, address buyer, uint price);

	/////////////////////////////////////// VARIABLES ///////////////////////////////////////
	// TokenContract -> TokenId -> OrderInfo
	mapping(address => mapping(uint => OrderInfo)) orders;

	/////////////////////////////////////// MODIFIERS ///////////////////////////////////////
	/////////////////////////////////////// PUBLIC //////////////////////////////////////////
	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
	}

	function tokenIsListed(address token, uint tokenId)
	public
	view
	returns(bool listed)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];

		return (order.owner != address(0x0));
	}

	function getOrderInfo(address token, uint tokenId)
		public
		view
		returns (
			address owner,
			uint buyPrice,
			address buyer,
			uint startPrice,
			uint endTime,
			uint highestBid
		)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];
		owner			= order.owner;
		buyPrice 		= order.buyPrice;
		buyer 			= order.buyer;
		startPrice 		= order.startPrice;
		endTime 		= order.endTime;
		highestBid 		= order.highestBid;
	}

	function listTokensAuction(
		address token,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == startPrices.length, "Array lengths must match");
		require(tokenIds.length == endTimes.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);

		address[] memory owners = new address[](tokenIds.length);
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(!orderExists(order), "Token must not be listed already");
			require(startPrices[i] <= buyPrices[i], "Start price must be less than or equal to the buy price");
			require(buyPrices[i] > 0, "Buy price must be greater than zero");
			require(endTimes[i] > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");
			require(isSpenderApproved(msg.sender, token , tokenIds[i]), "The seller must be allowed to sell the token");

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address owner = tokenInstance.ownerOf(tokenIds[i]);
			tokenInstance.transferFrom(owner, address(this), tokenIds[i]);
			owners[i] = owner;

			OrderInfo memory newOrder = OrderInfo(
				{
					owner: owner,
					buyPrice: buyPrices[i],
					buyer: address(0),
					startPrice: startPrices[i],
					endTime: endTimes[i],
					highestBid: 0
				}
			);

			orders[token][tokenIds[i]] = newOrder;
		}

		emit LogTokensListed(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices,
			startPrices,
			endTimes
		);
	}

	function placeBids(
		address token,
		uint [] tokenIds,
		uint [] bids
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == bids.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint bidRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(orderExists(order), "Token must be listed");
			require(now <= order.endTime, "Action must be open");

			// bid must be higher than the the current highest bid and by the start price
			require(bids[i] >= order.startPrice, "The bid must be greater than or equal to the start price");
			require(bids[i] >  order.highestBid, "The bid must be greater than the current highest bid");
			require(bids[i] <= order.buyPrice, "The bid must be less than or equal to the buy price");

			// refund the old bidder if there is any
			if (order.buyer != address(0)) {
				order.buyer.transfer(order.highestBid);
			}

			order.highestBid = bids[i];
			order.buyer = msg.sender;
			bidRunningSum += bids[i];

			emit LogBidPlaced(token, tokenIds[i], order.buyer, order.highestBid);

			// buy it now?
			if (bids[i] == order.buyPrice) {

				// transfer fee to market
				uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
				MARKET_FEE_COLLECTOR.transfer(marketFee);

				// transfer the rest of the amount to the owner
				uint ownerDue = order.highestBid.sub(marketFee);
				order.owner.transfer(ownerDue);

				// transfer token to buyer which is the same with sender and buyer
				tokenInstance.transferFrom(address(this), msg.sender, tokenIds[i]);

				emit LogTokenSold(token, tokenIds[i], order.buyer, order.highestBid);

				delete orders[token][tokenIds[i]];
			}
		}

		require(bidRunningSum == msg.value, "The amount passed must match the sum of the bids");
	}

	// MC: isn't this better called cancelOrders ?
	// Can we do a separate branch for renaming and involve Solo as well?
	function cancelTokens(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(orderExists(order), "Token must be listed");

			require(
				msg.sender == order.owner
				|| tokenInstance.getApproved(tokenIds[i]) == msg.sender
				|| tokenInstance.isApprovedForAll(order.owner, msg.sender),
				"Only the owner or the seller can cancel a token"
			);

			// ended auctions cannot be canceled - these are called Unsold
			require(now < order.endTime, "Auction must be open");
			require(order.highestBid == 0, "Only zero bids auctions can be cancelled");

			// transfer the token back to the owner
			tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

			delete orders[token][tokenIds[i]];
		}

		emit LogTokensCancelled(token, tokenIds);
	}

	// this will move the auctions into final states (Sold/Unsold)
	// if there are winners it will really do the exchange (tokens <-> ETH)
	// otherwise it will just transfer the tokens back to the owners
	function finalizeAuctions(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(orderExists(order), "Token must be listed");
			require(now >= order.endTime, "Auction must be ended");

			if (order.highestBid > 0) {

				// transfer fee to market
				uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
				MARKET_FEE_COLLECTOR.transfer(marketFee);

				// transfer the rest of the amount to the owner
				uint ownerDue = order.highestBid.sub(marketFee);
				order.owner.transfer(ownerDue);

				// transfer token to the highest bidder
				tokenInstance.transferFrom(address(this), order.buyer, tokenIds[i]);

				emit LogTokenSold(token, tokenIds[i], order.buyer, order.highestBid);

			} else {

				// no bids, the token is unsold

				// transfer the token back to the owner
				tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

				emit LogTokenUnsold(token, tokenIds[i]);
			}

			delete orders[token][tokenIds[i]];
		}
	}

	function buyTokens(
		address token,
		uint [] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(orderExists(order), "Token must be listed");
			require(msg.value >= ordersAmount + order.buyPrice, "The amount passed must cover the value of the tokens as listed");

			// update the orders amount
			ordersAmount += order.buyPrice;

			// transfer fee to market
			uint marketFee = order.buyPrice.mul(marketFeeNum).div(marketFeeDen);
			MARKET_FEE_COLLECTOR.transfer(marketFee);

			// transfer the rest to owner
			uint ownerDue = order.buyPrice.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer
			tokenInstance.transferFrom(address(this), msg.sender, tokenIds[i]);

			emit LogTokenSold(token, tokenIds[i], msg.sender, order.buyPrice);

			delete orders[token][tokenIds[i]];
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);
	}

	/////////////////////////////////////// INTERNAL ////////////////////////////////////////
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed)
	{
		return (order.owner != address(0x0));
	}
}
