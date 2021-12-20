pragma solidity ^0.4.24;

import {SafeMath} from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import {ERC721Token} from "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import {MarketUniqxBase} from "./MarketUniqxBase.sol";

contract MarketUniqxAuction is MarketUniqxBase {

	using SafeMath for uint;
	using SafeMath for uint128;
	using SafeMath for uint64;

	//------------------------------------- CONST -------------------------------------------
	uint constant AUCTION_MIN_DURATION = 1 hours;

	//------------------------------------- TYPES -------------------------------------------
	struct OrderInfo {
		address owner;          // the user who owns the token sold via this order
		address buyer;          // holds the highest bidder
		uint128 buyPrice;       // holds the 'buy it now' price
		uint128 startPrice; 	// holds the start price of an auction
		uint128 highestBid; 	// holds the highest bid at any given time
		uint64 endTime;		    // holds the time when the auction ends
	}

	//------------------------------------- EVENTS ------------------------------------------
	event LogCreate(
		address erc721,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice,
		uint startPrice,
		uint endTime
	);

	event LogCreateMany(
		address erc721,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);

	event LogUpdate(
		address erc721,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	);

	event LogUpdateMany(
		address erc721,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);

	event LogBid(
		address erc721,
		uint tokenId,
		address bidder,
		uint bid
	);

	event LogRetake(
		address erc721,
		uint tokenId
	);

	//------------------------------------- VARIABLES ----------------------------------------
	// TokenContract -> TokenId -> OrderInfo
	mapping(address => mapping(uint => OrderInfo)) orders;

	//------------------------------------- PUBLIC -------------------------------------------
	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
	}

	function tokenIsListed(address erc721, uint tokenId)
		whenErc721Registered(erc721)
		public
		view
		returns(bool listed) {

		OrderInfo storage order = orders[erc721][tokenId];
		return (order.owner != address(0x0));
	}

	function getOrderInfo(address erc721, uint tokenId)
		whenErc721Registered(erc721)
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

		OrderInfo storage order = orders[erc721][tokenId];
		owner			= order.owner;
		buyPrice 	= order.buyPrice;
		buyer 		= order.buyer;
		startPrice 	= order.startPrice;
		endTime 		= order.endTime;
		highestBid 	= order.highestBid;
	}

	function create(
		address erc721,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		address owner = _create(
			erc721,
			tokenInstance,
			tokenId,
			buyPrice,
			startPrice,
			endTime
		);

		emit LogCreate(
			erc721,
			tokenId,
			owner,
			msg.sender,
			buyPrice,
			startPrice,
			endTime
		);
	}

	function update(
		address erc721,
		uint tokenId,
		uint newBuyPrice,
		uint newStartPrice,
		uint newEndTime
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		_update(
			erc721,
			tokenInstance,
			tokenId,
			newBuyPrice,
			newStartPrice,
			newEndTime
		);

		emit LogUpdate(
			erc721,
			tokenId,
			newBuyPrice,
			newStartPrice,
			newEndTime
		);
	}

	function bid(
		address erc721,
		uint tokenId
	)
		whenNotPaused
		whenErc721Registered(erc721)
		nonReentrant
		public
		payable {

		ERC721Token tokenInstance = ERC721Token(erc721);
		_bid(
			erc721,
			tokenInstance,
			tokenId,
			msg.value
		);
	}

	function cancel(
		address erc721,
		uint tokenId
	)
		whenNotPaused
		whenErc721Registered(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		_cancel(
			erc721,
			tokenInstance,
			tokenId
		);

		emit LogCancel(erc721, tokenId);
	}

	//------------------------------------- BATCH -------------------------------------------
	function createMany(
		address erc721,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == startPrices.length, "Array lengths must match");
		require(tokenIds.length == endTimes.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(erc721);

		address[] memory owners = new address[](tokenIds.length);
		for(uint i = 0; i < tokenIds.length; i++) {
			owners[i] = _create(
				erc721,
				tokenInstance,
				tokenIds[i],
				buyPrices[i],
				startPrices[i],
				endTimes[i]
			);
		}

		emit LogCreateMany(
			erc721,
			tokenIds,
			owners,
			msg.sender,
			buyPrices,
			startPrices,
			endTimes
		);
	}

	function updateMany(
		address erc721,
		uint[] tokenIds,
		uint[] newBuyPrices,
		uint[] newStartPrices,
		uint[] newEndTimes
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == newBuyPrices.length, "Array lengths must match");
		require(tokenIds.length == newStartPrices.length, "Array lengths must match");
		require(tokenIds.length == newEndTimes.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(erc721);

		for(uint i = 0; i < tokenIds.length; i++) {
			_update(
				erc721,
				tokenInstance,
				tokenIds[i],
				newBuyPrices[i],
				newStartPrices[i],
				newEndTimes[i]
			);
		}

		emit LogUpdateMany(
			erc721,
			tokenIds,
			newBuyPrices,
			newStartPrices,
			newEndTimes
		);
	}

	function bidMany(
		address erc721,
		uint[] tokenIds,
		uint[] bids
	)
		whenNotPaused
		whenErc721Registered(erc721)
		nonReentrant
		public
		payable {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == bids.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(erc721);

		uint bidRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			_bid(
				erc721,
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
	}

	function cancelMany(
		address erc721,
		uint[] tokenIds
	)
		whenNotPaused
		whenErc721Registered(erc721)
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		ERC721Token tokenInstance = ERC721Token(erc721);

		for(uint i = 0; i < tokenIds.length; i++) {
			_cancel(
				erc721,
				tokenInstance,
				tokenIds[i]
			);
		}

		emit LogCancelMany(erc721, tokenIds);
	}

	// completes the auction
	// if there is a winner ?
    // it will really do the exchange (token <-> ETH)
	// otherwise the owner will retake his token
	function complete(
		address erc721,
		uint tokenId
	)
		whenNotPaused
		whenErc721Registered(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);

		OrderInfo storage order = orders[erc721][tokenId];

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
			tokenInstance.transferFrom(address(this), order.buyer, tokenId);
			emit LogBuy(erc721, tokenId, order.buyer);

		} else {
			// no bids, the token is unsold; transfer the token back to the owner
			tokenInstance.transferFrom(address(this), order.owner, tokenId);
			emit LogRetake(erc721, tokenId);
		}

		delete orders[erc721][tokenId];
	}


	//------------------------------------- INTERNAL ------------------------------------------
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed) {

		return (order.owner != address(0x0));
	}

	function _create(
		address erc721,
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

		OrderInfo storage order = orders[erc721][tokenId];
		require(!orderExists(order), "Token must not be already listed");
		require(buyPrice > 0, "Buy price must be greater than zero");
		require(startPrice <= buyPrice, "Start price must be less than or equal to the buy price");
		require(endTime > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");
		require(isSpenderApproved(msg.sender, erc721 , tokenId), "The seller must be allowed to sell the token");

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

		orders[erc721][tokenId] = newOrder;
		return owner;
	}

	function _update(
		address erc721,
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

		OrderInfo storage order = orders[erc721][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			msg.sender == order.owner ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can update an order"
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
		address erc721,
		ERC721Token tokenInstance,
		uint tokenId,
		uint bidAmount
	)
		canBeStoredWith128Bits(bidAmount)
		private {

		OrderInfo storage order = orders[erc721][tokenId];
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
			erc721,
			tokenId,
			order.buyer,
			order.highestBid
		);

		// buy it now?
		if (bidAmount == order.buyPrice) {

			// transfer fee to market
			uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
			MARKET_FEE_COLLECTOR.transfer(marketFee);

			// transfer the rest of the amount to the owner
			uint ownerDue = order.highestBid.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer which is the same with sender and buyer
			tokenInstance.transferFrom(address(this), msg.sender, tokenId);

			emit LogBuy(erc721, tokenId, order.buyer);
			delete orders[erc721][tokenId];
		}
	}

	function _cancel(
		address erc721,
		ERC721Token tokenInstance,
		uint tokenId
	)
		private {

		OrderInfo storage order = orders[erc721][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			msg.sender == order.owner ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can cancel an order"
		);

		// ended auctions cannot be canceled - these are called Unsold
		require(now < order.endTime, "Auction must be open");
		require(order.highestBid == 0, "Only zero bids auctions can be cancelled");

		// transfer the token back to the owner
		tokenInstance.transferFrom(address(this), order.owner, tokenId);

		delete orders[erc721][tokenId];
	}
}
