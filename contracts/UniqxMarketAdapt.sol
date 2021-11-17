pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";
import { SafeMath } from "../zeppelin/contracts/math/SafeMath.sol";
import { AdaptCollectibles } from "../adapt/contracts/AdaptCollectibles.sol";

contract UniqxMarketAdapt is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	address public MARKET_FEES_MSIG;
	AdaptCollectibles public ADAPT_TOKEN;

	uint public RESERVATION_TIME = 3 days;
	uint public MIN_DONATION = 10000000000000 wei;

	uint public MARKET_FEE_NUM = 4;
	uint public MARKET_FEE_DEN = 100;

	event LogOrdersCreated(uint[] _tokens);
	event LogOrdersCancelled(uint[] _tokens);
	event LogOrderAcquired(
		uint _tokenId,
		uint _price,
		address _maker,
		address _taker
	);

	enum OrderStatus {
		Unknown,
		Created,
		Cancelled,
		Reserved,
		Acquired
	}

	struct NftTokenOrder {
		uint makePrice;
		uint makeTime;
		uint acquirePrice;
		uint acquireTime;
		OrderStatus status;
		address maker;
		address owner;
	}

	mapping(uint => NftTokenOrder) orders;
	mapping(uint => address) reservations;

	constructor(
		address _marketAdmin,
		address _marketFees,
		address _adaptContract
	) public {

		MARKET_FEES_MSIG = _marketFees;
		ADAPT_TOKEN = AdaptCollectibles(_adaptContract);

		transferOwnership(_marketAdmin);
	}

	function getOrderStatus(uint _tokenId) public view
		returns (OrderStatus _status) {

		return orders[_tokenId].status;
	}

	function getOrderInfo(uint _tokenId) public view
		returns (
			OrderStatus _status,
			uint _makePrice,
			uint _makeTime,
			uint _acquirePrice,
			uint _acquireTime,
			address _maker
		) {

		NftTokenOrder storage order = orders[_tokenId];

		_status = order.status;
		_makePrice = order.makePrice;
		_makeTime = order.makeTime;
		_acquirePrice = order.acquirePrice;
		_acquireTime = order.acquireTime;
		_maker = order.maker;
	}

	function getReservation(uint _tokenId) public view
		returns (address beneficiary) {

		return reservations[_tokenId];
	}

	function isSpenderApproved(address _spender, uint256 _tokenId) internal view returns (bool) {
		address tokenOwner = ADAPT_TOKEN.ownerOf(_tokenId);

		return (_spender == tokenOwner ||
				ADAPT_TOKEN.getApproved(_tokenId) == _spender ||
				ADAPT_TOKEN.isApprovedForAll(tokenOwner, _spender));
	}

	function makeOrders(
			uint [] _tokenIds,
			uint [] _prices,
			address[] _reservations)
		public whenNotPaused nonReentrant
	{
		require(_tokenIds.length == _prices.length);
		require(_tokenIds.length == _reservations.length);

		for(uint i=0; i < _tokenIds.length; i++) {

			require(_prices[i] >= MIN_DONATION);

			// token must not be published on the market
			NftTokenOrder storage existingOrder = orders[_tokenIds[i]];
			require(
				existingOrder.status == OrderStatus.Unknown ||
				existingOrder.status == OrderStatus.Cancelled
			);

			// make sure the maker is approved to sell this item
			require(isSpenderApproved(msg.sender, _tokenIds[i]));

			// take temporary custody of the token
			address tokenOwner = ADAPT_TOKEN.ownerOf(_tokenIds[i]);
			ADAPT_TOKEN.transferFrom(tokenOwner, address(this), _tokenIds[i]);

			NftTokenOrder memory order = NftTokenOrder({
					makePrice: _prices[i],
					makeTime: now,
					acquirePrice: 0,
					acquireTime: 0,
					status: OrderStatus.Created,
					maker: msg.sender,
					owner: tokenOwner
				});

			if(_reservations[i] != address(0x0)) {
				reservations[_tokenIds[i]] = _reservations[i];
				order.status = OrderStatus.Reserved;
			}

			orders[_tokenIds[i]] = order;
		}

		emit LogOrdersCreated(_tokenIds);
	}

	function cancelOrders(uint [] _tokenIds)
	    public whenNotPaused nonReentrant
	{
		for(uint i=0; i < _tokenIds.length; i++) {
			NftTokenOrder storage order = orders[_tokenIds[i]];
			// only the original maker can cancel
			require(msg.sender == order.maker);

			// token must still be published on the market
			require(
				order.status == OrderStatus.Created ||
				order.status == OrderStatus.Reserved
			);
			// token must still be in temporary custody of the market
			require(ADAPT_TOKEN.ownerOf(_tokenIds[i]) == address(this));

			// transfer back to the original
			ADAPT_TOKEN.transferFrom(address(this), order.owner, _tokenIds[i]);

			order.status = OrderStatus.Cancelled;
		}

		emit LogOrdersCancelled(_tokenIds);
	}

	function takeOrders(uint [] _tokenIds)
		public payable whenNotPaused nonReentrant
	{
		uint amountLeft = msg.value;
		for(uint i=0; i<_tokenIds.length; i++) {
			uint amount = orders[_tokenIds[i]].makePrice;
			takeOrderInternal(_tokenIds[i], amount);
			amountLeft = amountLeft.sub(amount);
		}

		// the bundled value should match the price of all orders
		require(amountLeft == 0);
	}

	function takeOrder(uint _tokenId)
		public payable whenNotPaused nonReentrant
	{
		takeOrderInternal(_tokenId, msg.value);
	}

	function takeOrderInternal(uint _tokenId, uint _amount)
	    private
	{
		NftTokenOrder storage order = orders[_tokenId];

		require(
			order.status == OrderStatus.Created ||
			order.status == OrderStatus.Reserved
		);

		// the amount of ETH forwarded is higher than the make price
		require(_amount >= order.makePrice);

		// mark the order as acquired
		order.status = OrderStatus.Acquired;

		// update metadata before transfer
		ADAPT_TOKEN.setTokenMetadata(_tokenId, now, order.makePrice);

		// really transfer the token to the buyer
		ADAPT_TOKEN.transferFrom(address(this), msg.sender, _tokenId);

		// transfer fee to the market
		uint marketFee = _amount.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		MARKET_FEES_MSIG.transfer(marketFee);

		// transfer the amount due to the maker
		uint makerDue = order.makePrice.sub(marketFee);
		order.maker.transfer(makerDue);

		emit LogOrderAcquired(_tokenId, order.makePrice, order.maker, msg.sender);
	}
}
