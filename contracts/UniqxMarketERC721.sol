pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";

contract UniqxMarketERC721 is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	uint constant AUCTION_MIN_DURATION = 1 hours;
	address public MARKET_FEE_COLLECTOR;
	bool public ORDERS_ENABLED = true;
	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;

	enum OrderFormat {
		FixedPrice,
		Auction
	}

	enum OrderStatus {
		Unknown,
		Listed,			// token listed by owner or seller
		Reserved,		// not used in this contract
		Cancelled,		// order canceled by owner or seller (some restrictions are applied on auction orders)
		Sold,			// token sold, the item goes to the buyer or to the highest bidder on auction orders
		Unsold			// auction ended with zero bids, token goes back to owner
	}

	struct OrderInfo {

		// COMMON
		OrderFormat format;
		OrderStatus status;
		address owner; 				// the user who owns the token sold via this order
		address seller; 			// the seller (must be approved by the owner before listing)
		uint buyPrice;				// holds the 'buy it now' price
		address buyer;				// holds the address of the buyer or the address of the highest bidder

		// AUCTION ONLY
		uint startPrice; 			// holds the start price of an auction
		uint endTime;				// holds the time when the auction ends
		uint highestBid; 			// holds the highest bid at any given time
	}

	struct TokenContract {
		bool registered;
		bool ordersEnabled;
		mapping(uint => OrderInfo) orders;
	}

	mapping(address => TokenContract) tokenContracts;

	event LogOrdersEnabled();
	event LogOrdersDisabled();
	event LogTokenRegistered(address token);
	event LogTokenOrdersEnabled(address token);
	event LogTokenOrdersDisabled(address token);

	event LogTokensListedFixedPrice(
		// lookup
		address token,
		uint[] tokenIds,

		// common
		address[] owners,
		address seller,
		uint[] buyPrices
	);

	event LogTokensListedAuction(
		// lookup
		address token,
		uint[] tokenIds,

		// common
		address[] owners,
		address seller,
		uint[] buyPrices,

		// auction
		uint[] startPrices,
		uint[] endTimes
	);

	event LogBidPlaced(address token, uint tokenId, address bidder, uint bid);
	event LogTokenSold(address token, uint tokenId, address buyer, uint price);
	event LogTokensCancelled(address token, uint[] tokenIds);
	event LogTokenUnsold(address token, uint tokenId);

	modifier whenOrdersEnabled() {
		require(ORDERS_ENABLED, "Orders must be enabled");
		_;
	}

	modifier whenOrdersDisabled() {
		require(!ORDERS_ENABLED, "Orders must be disabled");
		_;
	}

	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
	}

	function setMarketFee(uint _marketFeeNum, uint _marketFeeDen)
		onlyOwner
	public {

		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;
	}

	function setMarketFeeCollector(address _marketFeeCollector)
		onlyOwner
	public {

		MARKET_FEE_COLLECTOR = _marketFeeCollector;
	}

	function enableOrders()
		onlyOwner
		whenOrdersDisabled
	public {

		ORDERS_ENABLED = true;
		emit LogOrdersEnabled();
	}

	function disableOrders()
		onlyOwner
		whenOrdersEnabled
	public {

		ORDERS_ENABLED = false;
		emit LogOrdersDisabled();
	}

	function registerToken(address token)
		onlyOwner
	public {

		require(!tokenContracts[token].registered, "Token should not be registered already");

		TokenContract memory tokenContract = TokenContract(
			{
				registered: true,
				ordersEnabled: true
			}
		);

		tokenContracts[token] = tokenContract;
		emit LogTokenRegistered(token);
	}

	function getTokenContractStatus(address token)
		public
		view
		returns(bool registered, bool ordersEnabled)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		registered = tokenContract.registered;
		ordersEnabled = tokenContract.ordersEnabled;
	}

	function enableTokenOrders(address token)
		onlyOwner
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(!tokenContract.ordersEnabled, "Orders must be disabled for this token");
		tokenContract.ordersEnabled = true;

		emit LogTokenOrdersEnabled(token);
	}


	function disableTokenOrders(address token)
		onlyOwner
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		tokenContract.ordersEnabled = false;

		emit LogTokenOrdersDisabled(token);
	}

	function isSpenderApproved(address spender, address token, uint256 tokenId)
		internal
		view
		returns (bool)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = tokenInstance.ownerOf(tokenId);

		return (spender == owner
				|| tokenInstance.getApproved(tokenId) == spender
				|| tokenInstance.isApprovedForAll(owner, spender));
	}

	function getOrderStatus(address token, uint tokenId)
		public
		view
		returns (OrderStatus status)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");

		return tokenContract.orders[tokenId].status;
	}

	function getOrderInfo(address token, uint tokenId)
		public
		view
		returns (
			OrderFormat format,
			OrderStatus status,
			address owner,
			address seller,
			uint buyPrice,
			address buyer,
			uint startPrice,
			uint endTime,
			uint highestBid
		)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = tokenContract.orders[tokenId];

		format 		= order.format;
		status 		= order.status;
		owner 		= order.owner;
		seller 		= order.seller;
		buyPrice 	= order.buyPrice;
		buyer 		= order.buyer;
		startPrice 	= order.startPrice;
		endTime 		= order.endTime;
		highestBid 	= order.highestBid;
	}

	function listTokensFixedPrice(
		address token, // MC: rename to tokenContract
		uint[] tokenIds,
		uint[] buyPrices
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);
		address[] memory owners = new address[](buyPrices.length);

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status != OrderStatus.Listed, "Token must not be listed already");
			require(isSpenderApproved(msg.sender, token , tokenIds[i]), "The seller must be allowed to sell the token");

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address owner = tokenInstance.ownerOf(tokenIds[i]);
			tokenInstance.transferFrom(owner, address(this), tokenIds[i]);
			owners[i] = owner;

			OrderInfo memory newOrder = OrderInfo(
				{
					format: OrderFormat.FixedPrice,
					status: OrderStatus.Listed,
					owner: owner,
					seller: msg.sender,
					buyPrice: buyPrices[i],
					buyer: address(0),
					startPrice: 0,
					endTime: 0,
					highestBid: 0
				}
			);

			tokenContracts[token].orders[tokenIds[i]] = newOrder;
		}

		emit LogTokensListedFixedPrice(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices
		);
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
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);
		address[] memory owners = new address[](buyPrices.length);

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == startPrices.length, "Array lengths must match");
		require(tokenIds.length == endTimes.length, "Array lengths must match");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status != OrderStatus.Listed, "Token must not be listed already");
			require(startPrices[i] <= buyPrices[i], "Start price must be less than or equal to the buy price");
			require(endTimes[i] > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");
			require(isSpenderApproved(msg.sender, token , tokenIds[i]), "The seller must be allowed to sell the token");

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address owner = tokenInstance.ownerOf(tokenIds[i]);
			tokenInstance.transferFrom(owner, address(this), tokenIds[i]);
			owners[i] = owner;

			OrderInfo memory newOrder = OrderInfo(
				{
					format: OrderFormat.Auction,
					status: OrderStatus.Listed,
					owner: owner,
					seller: msg.sender,
					buyPrice: buyPrices[i],
					buyer: address(0),
					startPrice: startPrices[i],
					endTime: endTimes[i],
					highestBid: 0
				}
			);

			tokenContracts[token].orders[tokenIds[i]] = newOrder;
		}

		emit LogTokensListedAuction(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices,
			startPrices,
			endTimes
		);
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
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");
			require(order.format == OrderFormat.FixedPrice, "Order type must be fixed price");
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

			delete tokenContract.orders[tokenIds[i]];
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);
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
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == bids.length, "Array lengths must match");

		uint bidRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");
			require(order.format == OrderFormat.Auction, "Order type must be auction");
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

				delete tokenContract.orders[tokenIds[i]];
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
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");

			require(
				msg.sender == order.seller ||
				msg.sender == order.owner,
				"Only the owner or the seller can cancel a token"
			);

			// few restrictions for auctions
			if (order.format == OrderFormat.Auction) {
				// ended auctions cannot be canceled - these are called Unsold
				require(now < order.endTime, "Auction must be open");
				require(order.highestBid == 0, "Only zero bids auctions can be cancelled");
			}

			// transfer the token back to the owner
			tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

			delete tokenContract.orders[tokenIds[i]];
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
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");
			require(order.format == OrderFormat.Auction, "Order type must be auction");
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

			delete tokenContract.orders[tokenIds[i]];
		}
	}
}
