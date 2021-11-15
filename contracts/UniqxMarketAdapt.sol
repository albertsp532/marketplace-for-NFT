pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";
import {AdaptCollectibles} from "../adapt/contracts/AdaptCollectibles.sol";

contract UniqxMarketAdapt is NoOwner, Pausable {

	using SafeMath for uint;

	address public MARKET_ADMIN_MSIG;
	address public MARKET_FEES_MSIG;
	AdaptCollectibles public ADAPT_TOKEN;

	uint public RESERVATION_TIME = 3 days;

	uint public MARKET_FEE_NUM = 4;
	uint public MARKET_FEE_DEN = 100;

	event LogOrdersCreated();
	event LogOrdersCancelled();
	event LogOrderSettled(uint tokenId);

	enum OrderStatus {
		Unknown,
		Created,
		Cancelled,
		Reserved,
		Settled
	}

	struct NftTokenOrder {
		uint makePrice;
		uint makeTime;
		uint settlePrice;
		uint settleTime;
		OrderStatus status;
		address maker;
	}

	mapping(uint => NftTokenOrder) orders;
	mapping(uint => address) reservations;

	constructor(
		address _marketAdmin,
		address _marketFees,
		address _adaptContract
	) public {

		MARKET_ADMIN_MSIG = _marketAdmin;
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
			uint _settlePrice,
			uint _settleTime,
			address _maker
		) {

		NftTokenOrder storage order = orders[_tokenId];

		_status = order.status;
		_makePrice = order.makePrice;
		_makeTime = order.makeTime;
		_settlePrice = order.settlePrice;
		_settleTime = order.settleTime;
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

	function make(
			uint [] _tokenIds,
			uint [] _prices,
			address[] _reservations)
		public whenNotPaused {

		require(_tokenIds.length == _prices.length);
		require(_tokenIds.length == _reservations.length);

		for(uint index=0; index<_tokenIds.length; index++) {
			// token must not be published on the market
			NftTokenOrder storage existingOrder = orders[_tokenIds[index]];
			require(
				existingOrder.status == OrderStatus.Unknown ||
				existingOrder.status == OrderStatus.Cancelled
			);

			// make sure the maker is approved to sell this item
			require(isSpenderApproved(msg.sender, _tokenIds[index]));

			// take temporary custody of the token
			address tokenOwner = ADAPT_TOKEN.ownerOf(_tokenIds[index]);
			ADAPT_TOKEN.transferFrom(tokenOwner, address(this), _tokenIds[index]);

			NftTokenOrder memory order = NftTokenOrder({
					makePrice: _prices[index],
					makeTime: now,
					settlePrice: 0,
					settleTime: 0,
					status: OrderStatus.Created,
					maker: msg.sender
				});

			if(_reservations[index] != address(0x0)) {
				reservations[_tokenIds[index]] = _reservations[index];
				order.status = OrderStatus.Reserved;
			}

			orders[_tokenIds[index]] = order;
		}

		emit LogOrdersCreated();
	}

	function cancel(uint [] _tokenIds) public whenNotPaused {

		for(uint index=0; index<_tokenIds.length; index++) {
			NftTokenOrder storage order = orders[_tokenIds[index]];
			// only the original maker can cancel
			require(msg.sender == order.maker);

			// token must still be published on the market
			require(
				order.status == OrderStatus.Created ||
				order.status == OrderStatus.Reserved
			);
			// token must still be in temporary custody of the market
			require(ADAPT_TOKEN.ownerOf(_tokenIds[index]) == address(this));

			ADAPT_TOKEN.transferFrom(address(this), order.maker, _tokenIds[index]);
			order.status = OrderStatus.Cancelled;
		}

		emit LogOrdersCancelled();
	}

	function take(uint _tokenId)
		public payable whenNotPaused {

		NftTokenOrder storage order = orders[_tokenId];

		// token must still be published on the market
		require(
			order.status == OrderStatus.Created ||
			order.status == OrderStatus.Reserved
		);
		// the amount of ETH forwarded is higher than make price
		require(msg.value >= order.makePrice);

		// the token must be reserved for the current buyer
		if(order.status == OrderStatus.Reserved &&
			order.makeTime + RESERVATION_TIME > now ) {
			require(msg.sender == reservations[_tokenId]);
		}

		uint marketFee = msg.value.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		uint makerDue = msg.value.sub(marketFee);

		order.status = OrderStatus.Settled;
		ADAPT_TOKEN.setTokenMetadata(_tokenId, now, msg.value);
		ADAPT_TOKEN.transferFrom(address(this), msg.sender, _tokenId);

		MARKET_FEES_MSIG.transfer(marketFee);
		order.maker.transfer(makerDue);

		emit LogOrderSettled(_tokenId);
	}
}
