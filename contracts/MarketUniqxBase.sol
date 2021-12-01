pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/HasNoTokens.sol";
import "../zeppelin/contracts/ownership/HasNoContracts.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";

contract MarketUniqxBase is Pausable, ReentrancyGuard, HasNoTokens, HasNoContracts {

	using SafeMath for uint;

	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	struct TokenContract {
		bool registered;
		bool ordersEnabled;
	}

	/////////////////////////////////////// EVENTS //////////////////////////////////////////
	event LogEnableOrders();
	event LogDisableOrders();

	event LogRegisterToken(address token);

	event LogEnableTokenOrders(address token);
	event LogDisableTokenOrders(address token);

	event LogCancel(address token, uint tokenIds);
	event LogCancelMany(address token, uint[] tokenIds);

	event LogBuy(address token, uint tokenId, address buyer);
	event LogBuyMany(address token, uint[] tokenIds, address buyer);

	/////////////////////////////////////// VARIABLES ///////////////////////////////////////
	address public MARKET_FEE_COLLECTOR;
	bool public ORDERS_ENABLED = true;
	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;
	mapping(address => TokenContract) tokenContracts;

	/////////////////////////////////////// MODIFIERS ///////////////////////////////////////
	modifier whenOrdersEnabled() {
		require(ORDERS_ENABLED, "Orders must be enabled");
		_;
	}

	modifier whenOrdersDisabled() {
		require(!ORDERS_ENABLED, "Orders must be disabled");
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

	/////////////////////////////////////// PUBLIC //////////////////////////////////////////
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

	function registerToken(address token)
		onlyOwner
		public {

		require(!tokenContracts[token].registered, "Token should not be registered already");

		TokenContract memory tokenContract = TokenContract({
			registered: true,
			ordersEnabled: true
		});

		tokenContracts[token] = tokenContract;
		emit LogRegisterToken(token);
	}

	function getTokenContractStatus(address token)
		public
		view
		returns(bool registered, bool ordersEnabled) {

		TokenContract storage tokenContract = tokenContracts[token];
		registered = tokenContract.registered;
		ordersEnabled = tokenContract.ordersEnabled;
	}

	function enableTokenOrders(address token)
		onlyOwner
		public {

		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(!tokenContract.ordersEnabled, "Orders must be disabled for this token");
		tokenContract.ordersEnabled = true;

		emit LogEnableTokenOrders(token);
	}

	function disableTokenOrders(address token)
		onlyOwner
		public {

		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		tokenContract.ordersEnabled = false;

		emit LogDisableTokenOrders(token);
	}

	/////////////////////////////////////// INTERNAL ////////////////////////////////////////

	function isSpenderApproved(address spender, address token, uint256 tokenId)
		internal
		view
		returns (bool) {

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = tokenInstance.ownerOf(tokenId);

		return (
			spender == owner ||
			tokenInstance.getApproved(tokenId) == spender ||
			tokenInstance.isApprovedForAll(owner, spender)
		);
	}
}
