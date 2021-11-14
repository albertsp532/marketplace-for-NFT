pragma solidity ^0.4.21;

import "../zeppelin/contracts/ownership/Ownable.sol";
import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/math/SafeMath.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";
import {Collectibles} from "../adapt/contracts/Collectibles.sol";

contract UniqxMarketAdapt is NoOwner, Pausable {

	using SafeMath for uint;

	address public MARKET_ADMIN_MSIG;
	address public MARKET_FEES_MSIG;
	Collectibles public AdaptToken;

	uint public RESERVATION_TIME = 3 days;

	uint public MARKET_FEE_NUM = 4;
	uint public MARKET_FEE_DEN = 100;

	event LogTokensPublished();
	event LogTokensCancelled();
	event LogTokenAcquired(uint tokenId);

	enum TokenStatus {
		Unknown,
		Published,
		Cancelled,
		Reserved,
		Acquired
	}

	struct NftToken {
		uint publishPrice;
		uint publishTime;
		uint acquirePrice;
		uint acquireTime;
		TokenStatus status;
		address seller;
	}

	mapping(uint => NftToken) tokens;
	mapping(uint => address) reservations;

	constructor(
		address _marketAdmin,
		address _marketFees,
		address _adaptContract
	) public {

		MARKET_ADMIN_MSIG = _marketAdmin;
		MARKET_FEES_MSIG = _marketFees;
		AdaptToken = Collectibles(_adaptContract);

		transferOwnership(_marketAdmin);
	}

	function getTokenStatus(uint _tokenId) public view
		returns (TokenStatus _status) {

		return tokens[_tokenId].status;
	}

	function getTokenInfo(uint _tokenId) public view
		returns (
			TokenStatus _status,
			uint _publishPrice,
			uint _publishTime,
			uint _acquirePrice,
			uint _acquireTime,
			address _seller
		) {

		NftToken storage nftToken = tokens[_tokenId];
		_publishPrice = nftToken.publishPrice;
		_publishTime = nftToken.publishTime;
		_acquirePrice = nftToken.acquirePrice;
		_acquireTime = nftToken.acquireTime;
		_status = nftToken.status;
		_seller = nftToken.seller;
	}

	function getReservation(uint _tokenId) public view
		returns (address beneficiary) {

		return reservations[_tokenId];
	}

	function isSpenderApproved(address _spender, uint256 _tokenId) internal view returns (bool) {
		address tokenOwner = AdaptToken.ownerOf(_tokenId);

		return _spender == tokenOwner ||
		AdaptToken.getApproved(_tokenId) == _spender ||
		AdaptToken.isApprovedForAll(tokenOwner, _spender);
	}

	function publish(
			uint [] _tokenIds,
			uint [] _prices,
			address[] _reservations)
		public whenNotPaused {

		require(_tokenIds.length == _prices.length);
		require(_tokenIds.length == _reservations.length);

		for(uint index=0; index<_tokenIds.length; index++) {
			// token must not be published on the market
			NftToken storage existingToken = tokens[_tokenIds[index]];
			require(
				existingToken.status == TokenStatus.Unknown ||
				existingToken.status == TokenStatus.Cancelled
			);

			// make sure the seller is approved to publish this item
			require(isSpenderApproved(msg.sender, _tokenIds[index]));

			// take temporary custody of the token
			address tokenOwner = AdaptToken.ownerOf(_tokenIds[index]);
			AdaptToken.transferFrom(tokenOwner, address(this), _tokenIds[index]);

			NftToken memory nftToken = NftToken({
					publishPrice: _prices[index],
					publishTime: now,
					acquirePrice: 0,
					acquireTime: 0,
					status: TokenStatus.Published,
					seller: msg.sender
				});

			if(_reservations[index] != address(0x0)) {
				reservations[_tokenIds[index]] = _reservations[index];
				nftToken.status = TokenStatus.Reserved;
			}

			tokens[_tokenIds[index]] = nftToken;
		}

		emit LogTokensPublished();
	}

	function cancel(uint [] _tokenIds) public whenNotPaused {

		for(uint index=0; index<_tokenIds.length; index++) {
			NftToken storage nftToken = tokens[_tokenIds[index]];
			// only the original seller can cancel
			require(msg.sender == nftToken.seller);

			// token must still be published on the market
			require(
				nftToken.status == TokenStatus.Published ||
				nftToken.status == TokenStatus.Reserved
			);
			// token must still be in temporary custody of the market
			require(AdaptToken.ownerOf(_tokenIds[index]) == address(this));

			AdaptToken.transferFrom(address(this), nftToken.seller, _tokenIds[index]);
			nftToken.status = TokenStatus.Cancelled;
		}

		emit LogTokensCancelled();
	}

	function acquire(uint _tokenId)
		public payable whenNotPaused {

		NftToken storage nftToken = tokens[_tokenId];

		// token must still be published on the market
		require(
			nftToken.status == TokenStatus.Published ||
			nftToken.status == TokenStatus.Reserved
		);
		// the amount of ETH forwarded is higher than publish price
		require(msg.value >= nftToken.publishPrice);

		// the token must be reserved for the current buyer
		if(nftToken.status == TokenStatus.Reserved &&
			nftToken.publishTime + RESERVATION_TIME > now ) {
			require(msg.sender == reservations[_tokenId]);
		}

		uint marketFee = msg.value.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		uint sellerDue = msg.value.sub(marketFee);

		nftToken.status = TokenStatus.Acquired;
		AdaptToken.setTokenMetadata(_tokenId, now, msg.value);
		AdaptToken.transferFrom(address(this), msg.sender, _tokenId);

		MARKET_FEES_MSIG.transfer(marketFee);
		nftToken.seller.transfer(sellerDue);

		emit LogTokenAcquired(_tokenId);
	}
}
