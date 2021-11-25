pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";
import { SafeMath } from "../zeppelin/contracts/math/SafeMath.sol";
import { AdaptCollectibles } from "../adapt/contracts/AdaptCollectibles.sol";

contract UniqxMarketAdapt is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	// constants
	uint public constant RESERVATION_TIME 	= 3 days;
	uint public constant MIN_DONATION 		= 10000000000000 wei;
	uint public constant MARKET_FEE_NUM 	= 4;
	uint public constant MARKET_FEE_DEN 	= 100;

	// declarations
	enum OrderStatus {
		Unknown,
		Listed,
		Reserved,
		Cancelled,
		Sold
	}

	struct OrderInfo {
		OrderStatus status;
		uint buyPrice;
		uint listedAt;
		address seller;
		address owner;
	}

	// attributes
	address public MARKET_FEES_MSIG;
	AdaptCollectibles public ADAPT_TOKEN;
	mapping(uint => OrderInfo) orders;
	mapping(uint => address) reservations;

	// events
	event LogTokensListed(
		uint[] tokenIds,
		uint[] buyPrices,
		address[] reservations,
		address[] owners,
		address seller
	);
	event LogTokenSold(uint tokenId, address buyer, uint price);
	event LogTokensCancelled(uint[] tokens);

	// entry point
	constructor(
		address marketAdmin,
		address marketFees,
		address adaptContract
	) public {

		MARKET_FEES_MSIG 	= marketFees;
		ADAPT_TOKEN 		= AdaptCollectibles(adaptContract);

		transferOwnership(marketAdmin);
	}

	function getOrderStatus(uint tokenId) public view
		returns (OrderStatus _status) {

		return orders[tokenId].status;
	}

	function getOrderInfo(uint _tokenId) public view
		returns (
			OrderStatus _status,
			uint _buyPrice,
			uint _listedAt,
			address _seller
		)
	{
		OrderInfo storage order = orders[_tokenId];
		_status = order.status;
		_buyPrice = order.buyPrice;
		_listedAt = order.listedAt;
		_seller = order.seller;
	}

	function getReservation(uint _tokenId) public view
		returns (address beneficiary) {

		return reservations[_tokenId];
	}

	function isSpenderApproved(
		address _spender,
		uint256 _tokenId
	)
		internal
		view
		returns (bool)
	{
		address tokenOwner = ADAPT_TOKEN.ownerOf(_tokenId);

		return (
			_spender == tokenOwner
			|| ADAPT_TOKEN.getApproved(_tokenId) == _spender
			|| ADAPT_TOKEN.isApprovedForAll(tokenOwner, _spender)
		);
	}

	function listTokens(
		uint [] tokenIds,
		uint [] buyPrices,
		address[] _reservations
	)
		public
		whenNotPaused
		nonReentrant
	{
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == _reservations.length, "Array lengths must match");

		address[] memory owners = new address[](buyPrices.length);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage existingOrder = orders[tokenIds[i]];
			require(
				existingOrder.status != OrderStatus.Listed &&
				existingOrder.status != OrderStatus.Reserved,
				"Token must not be listed already"
			);

			require(buyPrices[i] >= MIN_DONATION, "A minimum donation is enforced by the market");

			(uint256 timestamp, uint256 donation, uint256 copy) = ADAPT_TOKEN.getTokenMetadata(tokenIds[i]);
			require(timestamp == 0 && donation == 0, "Timestamp and donation must not be set");
			copy; // silence unused parameter warning

			require(isSpenderApproved(msg.sender, tokenIds[i]), "The seller must be allowed to sell the token");

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address tokenOwner = ADAPT_TOKEN.ownerOf(tokenIds[i]);
			ADAPT_TOKEN.transferFrom(tokenOwner, address(this), tokenIds[i]);
			owners[i] = tokenOwner;

			OrderInfo memory order = OrderInfo(
				{
					buyPrice: buyPrices[i],
					listedAt: now,
					status: OrderStatus.Listed,
					seller: msg.sender,
					owner: tokenOwner
				}
			);

			if(_reservations[i] != address(0x0)) {
				reservations[tokenIds[i]] = _reservations[i];
				order.status = OrderStatus.Reserved;
			}

			orders[tokenIds[i]] = order;
		}

		emit LogTokensListed(tokenIds, buyPrices, _reservations, owners, msg.sender);
	}

	function cancelTokens(uint[] tokenIds)
		public
		whenNotPaused
		nonReentrant
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		for(uint i=0; i < tokenIds.length; i++) {
			OrderInfo storage order = orders[tokenIds[i]];

			require(
				order.status == OrderStatus.Listed ||
				order.status == OrderStatus.Reserved,
				"Token must be listed or reserved"
			);

			require(
				msg.sender == order.seller ||
				msg.sender == order.owner,
				"Only the owner or the seller can cancel a token"
			);

			// transfer the token back to the owner
			ADAPT_TOKEN.transferFrom(address(this), order.owner, tokenIds[i]);

			delete orders[tokenIds[i]];
		}

		emit LogTokensCancelled(tokenIds);
	}

	function buyTokens(uint[] tokenIds)
		public
		payable
		whenNotPaused
		nonReentrant
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		uint amountLeft = msg.value;

		for(uint i = 0; i < tokenIds.length; i++) {
			uint amount = orders[tokenIds[i]].buyPrice;
			buyTokenInternal(tokenIds[i], amount);
			amountLeft = amountLeft.sub(amount);
		}

		require(amountLeft == 0, "The amount passed must match the prices sum of all tokes");
	}

	function buyToken(uint tokenId)
		public
		payable
		whenNotPaused
		nonReentrant
	{
		buyTokenInternal(tokenId, msg.value);
	}

	function buyTokenInternal(uint tokenId, uint amount) private {

		OrderInfo storage order = orders[tokenId];

		require(
			order.status == OrderStatus.Listed ||
			order.status == OrderStatus.Reserved,
			"Token must be listed or reserved"
		);

		if (
			order.status == OrderStatus.Reserved &&
			msg.sender != reservations[tokenId]
		) {
			require(now > order.listedAt + RESERVATION_TIME, "When not reserved for sender, reservation must be expired");
		}

		require(amount >= order.buyPrice, "The amount of ETH passed must be greater than or equal to the buy price");

		// update metadata before transfer
		ADAPT_TOKEN.setTokenMetadata(tokenId, now, order.buyPrice);

		// really transfer the token to the buyer
		ADAPT_TOKEN.transferFrom(address(this), msg.sender, tokenId);

		// transfer fee to the market
		uint marketFee = amount.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		MARKET_FEES_MSIG.transfer(marketFee);

		// transfer the amount due to the owner
		uint ownerDue = order.buyPrice.sub(marketFee);
		order.owner.transfer(ownerDue);

		delete orders[tokenId];

		emit LogTokenSold(tokenId, msg.sender, amount);
	}
}
