pragma solidity ^0.4.24;

import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";
import {MarketUniqxBase} from "./MarketUniqxBase.sol";

contract MarketUniqxAuction is MarketUniqxBase
{
	using SafeMath for uint;
	using SafeMath for uint128;
	using SafeMath for uint64;

	/////////////////////////////////////// CONSTANTS ///////////////////////////////////////
	uint constant AUCTION_MIN_DURATION = 1 hours;

	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	struct OrderInfo {
		address owner; 		// the user who owns the token sold via this order
		uint128 buyPrice;		// holds the 'buy it now' price
		address buyer;		   // holds the highest bidder
		uint128 startPrice; 	// holds the start price of an auction
		uint64 endTime;		// holds the time when the auction ends
		uint128 highestBid; 	// holds the highest bid at any given time
	}

	/////////////////////////////////////// EVENTS //////////////////////////////////////////
	event LogCreate(
		address token,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice,
		uint startPrice,
		uint endTime
	);

	event LogCreateMany(
		address token,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);

	event LogUpdate(
		address token,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	);

	event LogUpdateMany(
		address token,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);

	event LogBid(
		address token,
		uint tokenId,
		address bidder,
		uint bid
	);

	event LogBidMany(
		address token,
		uint[] tokenIds,
		address bidder,
		uint[] bids
	);

	event LogRetake(
		address token,
		uint tokenId
	);

	/////////////////////////////////////// VARIABLES ///////////////////////////////////////
	// TokenContract -> TokenId -> OrderInfo
	mapping(address => mapping(uint => OrderInfo)) orders;

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
		returns(bool listed) {

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
		) {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];
		owner			= order.owner;
		buyPrice 	= order.buyPrice;
		buyer 		= order.buyer;
		startPrice 	= order.startPrice;
		endTime 		= order.endTime;
		highestBid 	= order.highestBid;
	}

	function create(
		address token,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = _create(
			token,
			tokenInstance,
			tokenId,
			buyPrice,
			startPrice,
			endTime
		);

		emit LogCreate(
			token,
			tokenId,
			owner,
			msg.sender,
			buyPrice,
			startPrice,
			endTime
		);
	}

	function update(
		address token,
		uint tokenId,
		uint newBuyPrice,
		uint newStartPrice,
		uint newEndTime
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);
		_update(
			token,
			tokenInstance,
			tokenId,
			newBuyPrice,
			newStartPrice,
			newEndTime
		);

		emit LogUpdate(
			token,
			tokenId,
			newBuyPrice,
			newStartPrice,
			newEndTime
		);
	}

	function bid(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public
		payable {

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		_bid(
			token,
			tokenInstance,
			tokenId,
			msg.value
		);

		emit LogBid(token, tokenId, msg.sender, msg.value);
	}

	function cancel(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		_cancel(
			token,
			tokenInstance,
			tokenId
		);

		emit LogCancel(token, tokenId);
	}

	/////////////////////////////////////// MANY ////////////////////////////////////////////
	function createMany(
		address token,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == startPrices.length, "Array lengths must match");
		require(tokenIds.length == endTimes.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		address[] memory owners = new address[](tokenIds.length);
		for(uint i = 0; i < tokenIds.length; i++) {
			owners[i] = _create(
				token,
				tokenInstance,
				tokenIds[i],
				buyPrices[i],
				startPrices[i],
				endTimes[i]
			);
		}

		emit LogCreateMany(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices,
			startPrices,
			endTimes
		);
	}

	function updateMany(
		address token,
		uint[] tokenIds,
		uint[] newBuyPrices,
		uint[] newStartPrices,
		uint[] newEndTimes
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == newBuyPrices.length, "Array lengths must match");
		require(tokenIds.length == newStartPrices.length, "Array lengths must match");
		require(tokenIds.length == newEndTimes.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		for(uint i = 0; i < tokenIds.length; i++) {
			_update(
				token,
				tokenInstance,
				tokenIds[i],
				newBuyPrices[i],
				newStartPrices[i],
				newEndTimes[i]
			);
		}

		emit LogUpdateMany(
			token,
			tokenIds,
			newBuyPrices,
			newStartPrices,
			newEndTimes
		);
	}

	function bidMany(
		address token,
		uint[] tokenIds,
		uint[] bids
	)
		whenNotPaused
		nonReentrant
		public
		payable {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == bids.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		uint bidRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			_bid(
				token,
				tokenInstance,
				tokenIds[i],
				bids[i]
			);
			bidRunningSum = bidRunningSum.add(bids[i]);
		}

		require(
			bidRunningSum == msg.value,
			"The amount passed must match the sum of the bids"
		);
		emit LogBidMany(token, tokenIds, msg.sender, bids);
	}

	function cancelMany(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		for(uint i = 0; i < tokenIds.length; i++) {
			_cancel(
				token,
				tokenInstance,
				tokenIds[i]
			);
		}

		emit LogCancelMany(token, tokenIds);
	}

	// if there are winners it will really do the exchange (tokens <-> ETH)
	// otherwise the owners will retake their tokens
	function completeMany(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public {

		require(
			tokenIds.length > 0,
			"Array must have at least one entry"
		);

		ERC721Token tokenInstance = ERC721Token(token);
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

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
				emit LogBuy(token, tokenIds[i], order.buyer);

			} else {
				// no bids, the token is unsold; transfer the token back to the owner
				tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);
				emit LogRetake(token, tokenIds[i]);
			}

			delete orders[token][tokenIds[i]];
		}
	}


	/////////////////////////////////////// INTERNAL ////////////////////////////////////////
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed) {

		return (order.owner != address(0x0));
	}

	function _create(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	)
		private
		canBeStoredWith128Bits(startPrice)
		canBeStoredWith128Bits(buyPrice)
		canBeStoredWith64Bits(endTime)
		returns (address _owner) {

		OrderInfo storage order = orders[token][tokenId];
		require(!orderExists(order), "Token must not be already listed");
		require(buyPrice > 0, "Buy price must be greater than zero");
		require(startPrice <= buyPrice, "Start price must be less than or equal to the buy price");
		require(endTime > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");
		require(isSpenderApproved(msg.sender, token , tokenId), "The seller must be allowed to sell the token");

		// market will now escrow the token (owner and seller must approve uniqx market before listing)
		address owner = tokenInstance.ownerOf(tokenId);
		tokenInstance.transferFrom(owner, address(this), tokenId);

		OrderInfo memory newOrder = OrderInfo({
			owner: owner,
			buyPrice: uint128(buyPrice),
			buyer: address(0),
			startPrice: uint128(startPrice),
			endTime: uint64(endTime),
			highestBid: uint128(0)
		});

		orders[token][tokenId] = newOrder;
		return owner;
	}

	function _update(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint newBuyPrice,
		uint newStartPrice,
		uint newEndTime
	)
		canBeStoredWith128Bits(newStartPrice)
		canBeStoredWith128Bits(newBuyPrice)
		canBeStoredWith64Bits(newEndTime)
		private {

		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			msg.sender == order.owner ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can update a token"
		);

		require(now < order.endTime, "Auction must be open");
		require(order.highestBid == 0, "Only zero bids auctions can be updated");
		require(newBuyPrice > 0, "Buy price must be greater than zero");
		require(newStartPrice <= newBuyPrice, "Start price must be less than or equal to the buy price");
		require(newEndTime > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");

		order.buyPrice		= uint128(newBuyPrice);
		order.startPrice	= uint128(newStartPrice);
		order.endTime		= uint64(newEndTime);
	}

	function _bid(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint bidAmount
	)
		canBeStoredWith128Bits(bidAmount)
		private {

		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");
		require(now <= order.endTime, "Action must be open");

		require(bidAmount >= order.startPrice, "The bid must be greater than or equal to the start price");
		require(bidAmount >  order.highestBid, "The bid must be greater than the current highest bid");
		require(bidAmount <= order.buyPrice, "The bid must be less than or equal to the buy price");

		// refund the old bidder if there is any
		if (order.buyer != address(0)) {
			order.buyer.transfer(order.highestBid);
		}

		order.highestBid = uint128(bidAmount);
		order.buyer = msg.sender;

		emit LogBid(
			token,
			tokenId,
			order.buyer,
			order.highestBid
		);

		// buy it now?
		if (bidAmount == order.buyPrice) {

			// transfer fee to market
			uint marketFee = order.highestBid.mul(marketFeeNum).sub(marketFeeDen);
			MARKET_FEE_COLLECTOR.transfer(marketFee);

			// transfer the rest of the amount to the owner
			require(order.highestBid > marketFee);
			uint ownerDue = order.highestBid.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer which is the same with sender and buyer
			tokenInstance.transferFrom(address(this), msg.sender, tokenId);

			emit LogBuy(token, tokenId, order.buyer);
			delete orders[token][tokenId];
		}
	}

	function _cancel(
		address token,
		ERC721Token tokenInstance,
		uint tokenId
	)
		private {

		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			msg.sender == order.owner ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can cancel a token"
		);

		// ended auctions cannot be canceled - these are called Unsold
		require(now < order.endTime, "Auction must be open");
		require(order.highestBid == 0, "Only zero bids auctions can be cancelled");

		// transfer the token back to the owner
		tokenInstance.transferFrom(address(this), order.owner, tokenId);

		delete orders[token][tokenId];
	}
}
