pragma solidity ^0.4.24;

import {SafeMath} from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import {ERC721Token} from "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import {MarketUniqxBase} from "./MarketUniqxBase.sol";

contract MarketUniqxInstant is MarketUniqxBase {

	using SafeMath for uint;

	//------------------------------------- TYPES -------------------------------------------
	struct OrderInfo {
		address owner;	// the user who owns the token sold via this order
		uint buyPrice;	// holds the 'buy it now' price
	}

	//------------------------------------- EVENTS ------------------------------------------
	event LogCreate(
		address erc721,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice
	);

	event LogCreateMany(
		address erc721,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices
	);

	event LogUpdate(
		address erc721,
		uint tokenId,
		uint newPrice
	);

	event LogUpdateMany(
		address erc721,
		uint[] tokenIds,
		uint[] newPrices
	);

	//------------------------------------- VARIABLES ----------------------------------------
	// ERC721 -> TokenId -> OrderInfo
	mapping(address => mapping(uint => OrderInfo)) orders;

	//------------------------------------- PUBLIC -------------------------------------------
	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
	}

	function getOrderInfo(address erc721, uint tokenId)
		whenErc721Registered(erc721)
		public
		view
		returns (address owner, uint buyPrice) {

		OrderInfo storage order = orders[erc721][tokenId];
		owner		= order.owner;
		buyPrice = order.buyPrice;
	}

	function tokenIsListed(address erc721, uint tokenId)
		whenErc721Registered(erc721)
		public
		view
		returns(bool listed) {

		OrderInfo storage order = orders[erc721][tokenId];
		return (order.owner != address(0x0));
	}

	function create(
		address erc721,
		uint tokenId,
		uint buyPrice
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		address owner = _create(erc721, tokenInstance, tokenId, buyPrice);

		emit LogCreate(
			erc721,
			tokenId,
			owner,
			msg.sender,
			buyPrice
		);
	}

	function update(
		address erc721,
		uint tokenId,
		uint newPrice
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		_update(erc721, tokenInstance, tokenId, newPrice);

		emit LogUpdate(
			erc721,
			tokenId,
			newPrice
		);
	}

	function buy(
		address erc721,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		whenErc721Registered(erc721)
		public
		payable {

		ERC721Token tokenInstance = ERC721Token(erc721);

		uint price = _buy(erc721, tokenInstance, tokenId, 0);
		require(price == msg.value, 'Must match the list price');

		emit LogBuy(erc721, tokenId, msg.sender);
	}

	function cancel(
		address erc721,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		whenErc721Registered(erc721)
		public {

		ERC721Token tokenInstance = ERC721Token(erc721);
		_cancel(erc721, tokenInstance, tokenId);

		emit LogCancel(erc721, tokenId);
	}

	//------------------------------------- BATCH ------------------------------------------
	function createMany(
		address erc721,
		uint[] tokenIds,
		uint[] buyPrices
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(erc721);
		address[] memory owners = new address[](tokenIds.length);

		for(uint i = 0; i < tokenIds.length; i++) {
			owners[i] = _create(erc721, tokenInstance, tokenIds[i], buyPrices[i]);
		}

		emit LogCreateMany(
			erc721,
			tokenIds,
			owners,
			msg.sender,
			buyPrices
		);
	}

	function updateMany(
		address erc721,
		uint[] tokenIds,
		uint[] newPrices
	)
		whenNotPaused
		whenOrdersEnabled
		whenErc721RegisteredAndEnabled(erc721)
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == newPrices.length, "Array lengths must match");

		ERC721Token tokenInstance = ERC721Token(erc721);

		for(uint i = 0; i < tokenIds.length; i++) {
			_update(erc721, tokenInstance, tokenIds[i], newPrices[i]);
		}

		emit LogUpdateMany(
			erc721,
			tokenIds,
			newPrices
		);
	}

	function buyMany(
		address erc721,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		whenErc721Registered(erc721)
		public
		payable {

		require(tokenIds.length > 0, "Array must have at least one entry");
		ERC721Token tokenInstance = ERC721Token(erc721);

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			uint amount = _buy(erc721, tokenInstance, tokenIds[i], ordersAmount);
			ordersAmount = ordersAmount.add(amount);
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);

		emit LogBuyMany(erc721, tokenIds, msg.sender);
	}

	function cancelMany(
		address erc721,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		whenErc721Registered(erc721)
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		ERC721Token tokenInstance = ERC721Token(erc721);

		for(uint i = 0; i < tokenIds.length; i++) {
			_cancel(erc721, tokenInstance, tokenIds[i]);
		}

		emit LogCancelMany(erc721, tokenIds);
	}

	//------------------------------------- INTERNAL ------------------------------------------
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed) {

		return (order.owner != address(0x0));
	}

	// list token and return previous owner
	function _create(
		address erc721,
		ERC721Token tokenInstance,
		uint tokenId,
		uint buyPrice
	)
		private
		returns(address _owner) {

		require(
			buyPrice > 0,
			"Price must be greater than zero"
		);

		OrderInfo storage order = orders[erc721][tokenId];
		require(
			!orderExists(order),
			"Token must not be listed already"
		);

		require(
			isSpenderApproved(msg.sender, erc721 , tokenId),
			"The seller must be allowed to sell the token"
		);

		// market will now escrow the token (owner and seller(if any) must approve the market before listing)
		address owner = tokenInstance.ownerOf(tokenId);
		tokenInstance.transferFrom(owner, address(this), tokenId);

		OrderInfo memory newOrder = OrderInfo( {
			owner: owner,
			buyPrice: buyPrice
		});

		orders[erc721][tokenId] = newOrder;
		return owner;
	}

	function _update(
		address erc721,
		ERC721Token tokenInstance,
		uint tokenId,
		uint newPrice
	)
		private {

		OrderInfo storage order = orders[erc721][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			order.owner == msg.sender ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can update an order"
		);

		require(
			newPrice > 0,
			"The new price must be greater than zero"
		);
		order.buyPrice = newPrice;
	}

	function _buy(
		address erc721,
		ERC721Token tokenInstance,
		uint tokenId,
		uint ordersAmount
	)
		private
		returns(uint price) {

		OrderInfo storage order = orders[erc721][tokenId];
		require(orderExists(order), "Token must be listed");

		price = order.buyPrice;
		require(
			msg.value >= ordersAmount + order.buyPrice,
			"The amount passed must cover the value of the tokens as listed"
		);

		// transfer fee to market
		uint marketFee = order.buyPrice.mul(marketFeeNum).div(marketFeeDen);
		MARKET_FEE_COLLECTOR.transfer(marketFee);

		// transfer the rest to owner
		uint ownerDue = order.buyPrice.sub(marketFee);
		order.owner.transfer(ownerDue);

		// transfer token to buyer
		tokenInstance.transferFrom(address(this), msg.sender, tokenId);
		delete orders[erc721][tokenId];
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
			order.owner == msg.sender ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can cancel an order"
		);

		// transfer the token back to the owner
		tokenInstance.transferFrom(address(this), order.owner, tokenId);
		delete orders[erc721][tokenId];
	}
}
