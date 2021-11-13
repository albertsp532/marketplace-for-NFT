pragma solidity ^0.4.19;

import {Ownable} from '../zeppelin/contracts/ownership/Ownable.sol';
import {TokenTimelock} from '../zeppelin/contracts/token/ERC20/TokenTimelock.sol';
import {HasNoEtherTest} from '../zeppelin/contracts/mocks/HasNoEtherTest.sol';
import {ERC223TokenMock} from '../zeppelin/contracts/mocks/ERC223TokenMock.sol';
import {ForceEther} from '../zeppelin/contracts/mocks/ForceEther.sol';
import {BasicTokenMock} from '../zeppelin/contracts/mocks/BasicTokenMock.sol';
import {DetailedERC20Mock} from '../zeppelin/contracts/mocks/DetailedERC20Mock.sol';
import {PausableMock} from '../zeppelin/contracts/mocks/PausableMock.sol';
import {PausableTokenMock} from '../zeppelin/contracts/mocks/PausableTokenMock.sol';
import {SafeERC20Helper} from '../zeppelin/contracts/mocks/SafeERC20Helper.sol';
import {SafeMathMock} from '../zeppelin/contracts/mocks/SafeMathMock.sol';
import {StandardTokenMock} from '../zeppelin/contracts/mocks/StandardTokenMock.sol';
import {BurnableTokenMock} from '../zeppelin/contracts/mocks/BurnableTokenMock.sol';

contract MockInclude {
	function MockInclude() public {

	}
}
