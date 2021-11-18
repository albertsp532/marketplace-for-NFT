pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";

contract UniqxMarketERC721Auction is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	address public MARKET_FEES_MSIG;
	bool public AUCTIONS_ALLOWED = true;

	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;

	enum AuctionStatus {
		Unknown,
		Created,
		Bidden
	}

	struct AuctionInfo {
		uint makeMinPrice;
		uint makeMaxPrice;

		uint makeTime;
		uint expiryTime;

		AuctionStatus status;

		address maker;
		address owner;

		uint bid; // this is the largest current bid
		uint bidTime;
		address bidder;
	}

	struct UniqxMarketContract {
		bool registered;
		bool auctionsAllowed;
		mapping(uint => AuctionInfo) auctions;
	}

	mapping(address => UniqxMarketContract) contracts;

	event LogAllowAuctions();
  	event LogDisallowAuctions();

	event LogAllowContractAuctions(address _contract);
	event LogDisallowContractAuctions(address _contract);

	event LogRegisterContract(address _contract);

	event LogSetFeePercentage(
		uint _marketFeeNum,
		uint _marketFeeDen
	);

	event LogAuctionsCreated(address _contract, uint[] _tokens);
	event LogAuctionsCancelled(address _contract, uint[] _tokens);
	event LogAuctionsChanged(address _contract, uint[] _tokens);
	event LogAuctionSettled(
		address _contract,
		uint _tokenId,
		uint _price,
		address _maker,
		address _taker
	);

	modifier whenAuctionsNotAllowed() {
		require(!AUCTIONS_ALLOWED);
		_;
	}

	modifier whenAuctionsAllowed() {
		require(AUCTIONS_ALLOWED);
		_;
	}

	constructor(address _marketAdmin, address _marketFeesMsig) public {

		MARKET_FEES_MSIG = _marketFeesMsig;
		transferOwnership(_marketAdmin);
	}

	function allowAuctions() onlyOwner whenAuctionsNotAllowed public {

		AUCTIONS_ALLOWED = true;
		emit LogAllowAuctions();
	}

	function disallowAuctions() onlyOwner whenAuctionsAllowed public {

		AUCTIONS_ALLOWED = false;
		emit LogDisallowAuctions();
	}

	function allowContractAuctions(address _contract) onlyOwner public {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		require(!marketContract.auctionsAllowed);
		marketContract.auctionsAllowed = true;

		emit LogAllowContractAuctions(_contract);
	}

	function disallowContractAuctions(address _contract) onlyOwner
	public {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		require(marketContract.auctionsAllowed);
		marketContract.auctionsAllowed = false;

		emit LogDisallowContractAuctions(_contract);
	}

	function registerContract(address _contract) onlyOwner
	public {

		require(!contracts[_contract].registered);

		UniqxMarketContract memory newMarketContract = UniqxMarketContract({
			registered: true,
			auctionsAllowed: true
		});

		contracts[_contract] = newMarketContract;
		emit LogRegisterContract(_contract);
	}

	function setFeePercentage(uint _marketFeeNum, uint _marketFeeDen) onlyOwner
	public {

		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;

		emit LogSetFeePercentage(_marketFeeNum, _marketFeeDen);
	}

	function isSpenderApproved(address _contract, address _spender, uint256 _tokenId)
	internal view returns (bool) {

		require(contracts[_contract].registered);

		ERC721Token token = ERC721Token(_contract);
		address tokenOwner = token.ownerOf(_tokenId);

		return (_spender == tokenOwner ||
				token.getApproved(_tokenId) == _spender ||
				token.isApprovedForAll(tokenOwner, _spender));
	}

	function getAuctionStatus(address _contract, uint _tokenId)
	public view returns (AuctionStatus _status) {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		return marketContract.auctions[_tokenId].status;
	}

	function getAuctionInfo(address _contract, uint _tokenId)
	public view returns (
			AuctionStatus _status,
			address _maker,
			uint _makeMinPrice,
			uint _makeMaxPrice,
			uint _makeTime,
			uint _expiryTime,

			uint _bid,
			address _bidder
		) {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		AuctionInfo storage auction = marketContract.auctions[_tokenId];

		_status = auction.status;
		_maker = auction.maker;
		_makeMinPrice = auction.makeMinPrice;
		_makeMaxPrice = auction.makeMaxPrice;
		_makeTime = auction.makeTime;
		_expiryTime = auction.expiryTime;

		_bid = auction.bid;
		_bidder = auction.bidder;
	}

	function makeAuctions(
			address _contract,
			uint [] _tokenIds,
			uint [] _minPrices,
			uint [] _maxPrices,
			uint [] _expiryTimes) whenNotPaused whenAuctionsAllowed nonReentrant
		public  {

		require(_tokenIds.length == _minPrices.length);
		require(_tokenIds.length == _maxPrices.length);
		require(_tokenIds.length == _expiryTimes.length);
		UniqxMarketContract storage marketContract = contracts[_contract];

		require(marketContract.registered);
		require(marketContract.auctionsAllowed);

		for(uint index=0; index<_tokenIds.length; index++) {
			// token must not be published on the market
			AuctionInfo storage existingAuction = marketContract.auctions[_tokenIds[index]];
			require(existingAuction.status == AuctionStatus.Unknown);

			// make sure the maker is approved to sell this item
			require(isSpenderApproved(_contract, msg.sender, _tokenIds[index]));

			// take temporary custody of the token
			ERC721Token token = ERC721Token(_contract);
			address tokenOwner = token.ownerOf(_tokenIds[index]);
			token.transferFrom(tokenOwner, address(this), _tokenIds[index]);

			AuctionInfo memory auction = AuctionInfo({
					makeMinPrice: _minPrices[index],
					makeMaxPrice: _maxPrices[index],
					makeTime: now,
					expiryTime: _expiryTimes[index],
					bid: 0,
					bidder: address(0),
					status: AuctionStatus.Created,
					maker: msg.sender,
					owner: tokenOwner
				});

			marketContract.auctions[_tokenIds[index]] = auction;
		}

		emit LogAuctionsCreated(_contract, _tokenIds);
	}

	function cancelAuctions(address _contract, uint [] _tokenIds) whenNotPaused nonReentrant
	public {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		for(uint index=0; index<_tokenIds.length; index++) {
			AuctionInfo storage auction = marketContract.auctions[_tokenIds[index]];

			// only the original maker can cancel
			require(
				msg.sender == auction.maker ||
				msg.sender == auction.owner
			);

			// token must still be published on the market
			require(auction.status != AuctionStatus.Unknown);

			// token must still be in escrow in this market contract
			ERC721Token token = ERC721Token(_contract);
			require(token.ownerOf(_tokenIds[index]) == address(this));

			// transfer back to the original owner of the token
			token.transferFrom(address(this), auction.owner, _tokenIds[index]);

			// if we have a bidder, refund his ether
			if(auction.bid > 0 && auction.bidder != address(0)) {
				auction.bidder.transfer(auction.bid);
			}

			// delete the auction from the storage
			delete marketContract.auctions[_tokenIds[index]];
		}

		emit LogAuctionsCancelled(_contract, _tokenIds);
	}


	function bidAuctions(address _contract, uint [] _tokenIds, uint[] _bids) whenNotPaused nonReentrant
	public payable {

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		uint _bidsValue = msg.value;
		for(uint index=0; index<_tokenIds.length; index++) {

			AuctionInfo storage auction = marketContract.auctions[_tokenIds[index]];

			// token must still be published on the market
			require(auction.status != AuctionStatus.Unknown);

			// the bid must be bigger than the make price

			// should still have enough ETH to pay this bid
			require(_bidsValue >= _bids[index]);

			uint marketFee = auction.makePrice.mul(marketFeeNum).div(marketFeeDen);
			uint makerDue = auction.makePrice.sub(marketFee);

			_bidsValue = _bidsValue.sub(auction.makePrice);

			ERC721Token token = ERC721Token(_contract);
			token.transferFrom(address(this), msg.sender, _tokenIds[index]);

			MARKET_FEES_MSIG.transfer(marketFee);
			auction.maker.transfer(makerDue);

			emit LogAuctionSettled(_contract, _tokenIds[index], auction.makePrice, auction.maker, msg.sender);

			delete marketContract.auctions[_tokenIds[index]];
		}

		// the bundled value should match the price of all auctions
		require(_bidsValue == 0);
	}
}
