pragma solidity ^0.4.24;

import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";
import {MarketUniqxBase} from "./MarketUniqxBase.sol";

contract MarketUniqxInstant is MarketUniqxBase {

	using SafeMath for uint;

	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	struct OrderInfo {
		address owner;	// the user who owns the token sold via this order
		uint buyPrice;	// holds the 'buy it now' price
	}

	/////////////////////////////////////// EVENTS //////////////////////////////////////////
	event LogCreate(
		address token,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice
	);

	event LogCreateMany(
		address token,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices
	);

	event LogUpdate(
		address token,
		uint tokenId,
		uint newPrice
	);

	event LogUpdateMany(
		address token,
		uint[] tokenIds,
		uint[] newPrices
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

	function getOrderInfo(address token, uint tokenId)
		public
		view
		returns (address owner, uint buyPrice) {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];

		owner		= order.owner;
		buyPrice 	= order.buyPrice;
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

	function create(
		address token,
		uint tokenId,
		uint buyPrice
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);

		address owner = _create(token, tokenInstance, tokenId, buyPrice);

		emit LogCreate(
			token,
			tokenId,
			owner,
			msg.sender,
			buyPrice
		);
	}

	function update(
		address token,
		uint tokenId,
		uint newPrice
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);

		_update(token, tokenInstance, tokenId, newPrice);

		emit LogUpdate(
			token,
			tokenId,
			newPrice
		);
	}

	function buy(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public
		payable {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint price = _buy(token, tokenInstance, tokenId, 0);

		require(price == msg.value, 'Must match the list price');

		emit LogBuy(token, tokenId, msg.sender);
	}

	function cancel(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);
		_cancel(token, tokenInstance, tokenId);

		emit LogCancel(token, tokenId);
	}

	/////////////////////////////////////// BATCH ///////////////////////////////////////////
	function createMany(
		address token, // MC: rename to tokenContract
		uint[] tokenIds,
		uint[] buyPrices
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);

		address[] memory owners = new address[](tokenIds.length);
		for(uint i = 0; i < tokenIds.length; i++) {
			owners[i] = _create(token, tokenInstance, tokenIds[i], buyPrices[i]);
		}

		emit LogCreateMany(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices
		);
	}

	function updateMany(
		address token,
		uint[] tokenIds,
		uint[] newPrices
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == newPrices.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {
			_update(token, tokenInstance, tokenIds[i], newPrices[i]);
		}

		emit LogUpdateMany(
			token,
			tokenIds,
			newPrices
		);
	}

	function buyMany(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
		payable {

		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			uint amount = _buy(token, tokenInstance, tokenIds[i], ordersAmount);
			ordersAmount = ordersAmount.add(amount);
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);

		emit LogBuyMany(token, tokenIds, msg.sender);
	}

	function cancelMany(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public {

		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {
			_cancel(token, tokenInstance, tokenIds[i]);
		}

		emit LogCancelMany(token, tokenIds);
	}

	/////////////////////////////////////// INTERNAL ////////////////////////////////////////
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed) {

		return (order.owner != address(0x0));
	}

	// list token and return previous owner
	function _create(
		address token,
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

		OrderInfo storage order = orders[token][tokenId];
		require(
			!orderExists(order),
			"Token must not be listed already"
		);

		require(
			isSpenderApproved(msg.sender, token , tokenId),
			"The seller must be allowed to sell the token"
		);

		// market will now escrow the token (owner and seller(if any) must approve the market before listing)
		address owner = tokenInstance.ownerOf(tokenId);
		tokenInstance.transferFrom(owner, address(this), tokenId);

		OrderInfo memory newOrder = OrderInfo( {
			owner: owner,
			buyPrice: buyPrice
		});

		orders[token][tokenId] = newOrder;
		return owner;
	}

	function _update(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint newPrice
	)
		private {

		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			order.owner == msg.sender ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can update a token"
		);

		require(
			newPrice > 0,
			"The new price must be greater than zero"
		);
		order.buyPrice = newPrice;
	}

	function _buy(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint ordersAmount
	)
		private
		returns(uint price) {

		OrderInfo storage order = orders[token][tokenId];
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
		delete orders[token][tokenId];
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
			order.owner == msg.sender ||
			tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can cancel a token"
		);

		// transfer the token back to the owner
		tokenInstance.transferFrom(address(this), order.owner, tokenId);
		delete orders[token][tokenId];
	}
}
