pragma solidity ^0.4.24;

import {Pausable} from "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-solidity/contracts/ReentrancyGuard.sol";
import {SafeMath} from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import {ERC721Token} from "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";

contract MarketUniqxBase is Pausable, ReentrancyGuard {

	using SafeMath for uint;

	//------------------------------------- TYPES -------------------------------------------
	struct TokenFlags {
		bool registered;
		bool ordersEnabled;
	}

	//------------------------------------- EVENTS ------------------------------------------
	event LogEnableOrders();
	event LogDisableOrders();

	event LogRegisterToken(address erc721);

	event LogEnableTokenOrders(address erc721);
	event LogDisableTokenOrders(address erc721);

	event LogCancel(address erc721, uint tokenId);
	event LogCancelMany(address erc721, uint[] tokenIds);

	event LogBuy(address erc721, uint tokenId, address buyer);
	event LogBuyMany(address erc721, uint[] tokenIds, address buyer);

	//------------------------------------- VARIABLES ----------------------------------------
	address public MARKET_FEE_COLLECTOR;
	bool public ORDERS_ENABLED = true;
	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;
	mapping(address => TokenFlags) tokenFlags;

	//------------------------------------- MODIFIERS ----------------------------------------
	modifier whenOrdersEnabled() {
		require(
			ORDERS_ENABLED,
			"Orders must be enabled"
		);

		_;
	}

	modifier whenOrdersDisabled() {
		require(
			!ORDERS_ENABLED,
			"Orders must be disabled"
		);

		_;
	}

	modifier canBeStoredWith64Bits(uint256 _value) {
		require(_value <= 18446744073709551615);
		_;
	}

	modifier canBeStoredWith128Bits(uint256 _value) {
		require(_value < 340282366920938463463374607431768211455);
		_;
	}

	modifier whenErc721RegisteredAndEnabled(address erc721) {
		TokenFlags storage flags = tokenFlags[erc721];
		require(
			flags.registered,
			"Token must be registered"
		);

		require(
			flags.ordersEnabled,
			"Orders must be enabled for this erc721"
		);

		_;
	}

	modifier whenErc721Registered(address erc721) {
		TokenFlags storage flags = tokenFlags[erc721];
		require(
			flags.registered,
			"Token must be registered"
		);

		_;
	}

	// @dev Disallows direct send by setting a default function without the `payable` flag.
	function() external {}

	//------------------------------------- PUBLIC ------------------------------------------

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
		emit LogEnableOrders();
	}

	function disableOrders()
		onlyOwner
		whenOrdersEnabled
		public {

		ORDERS_ENABLED = false;
		emit LogDisableOrders();
	}

	function registerToken(address erc721)
		onlyOwner
		public {

		require(
			!tokenFlags[erc721].registered,
			"Token should not be registered already"
		);

		TokenFlags memory flags = TokenFlags({
			registered: true,
			ordersEnabled: true
		});

		tokenFlags[erc721] = flags;
		emit LogRegisterToken(erc721);
	}

	function getTokenFlags(address erc721)
		public
		view
		returns(bool registered, bool ordersEnabled) {

		TokenFlags storage flags = tokenFlags[erc721];
		registered = flags.registered;
		ordersEnabled = flags.ordersEnabled;
	}

	function enableTokenOrders(address erc721)
		whenErc721Registered(erc721)
		onlyOwner
		public {

		TokenFlags storage flags = tokenFlags[erc721];
		require(
			!flags.ordersEnabled,
			"Orders must be disabled for this erc721"
		);

		flags.ordersEnabled = true;
		emit LogEnableTokenOrders(erc721);
	}

	function disableTokenOrders(address erc721)
		whenErc721Registered(erc721)
		onlyOwner
		public {

		TokenFlags storage flags = tokenFlags[erc721];
		require(
			flags.ordersEnabled,
			"Orders must be enabled for this erc721"
		);

		flags.ordersEnabled = false;
		emit LogDisableTokenOrders(erc721);
	}

	//------------------------------------- INTERNAL ------------------------------------------

	function isSpenderApproved(address spender, address erc721, uint256 tokenId)
		whenErc721Registered(erc721)
		internal
		view
		returns (bool) {

		ERC721Token tokenInstance = ERC721Token(erc721);
		address owner = tokenInstance.ownerOf(tokenId);

		return (
			spender == owner ||
			tokenInstance.getApproved(tokenId) == spender ||
			tokenInstance.isApprovedForAll(owner, spender)
		);
	}
}
