pragma solidity ^0.4.19;

import {Ownable} from '../zeppelin/contracts/ownership/Ownable.sol';
import {ERC721BasicTokenMock} from '../zeppelin/contracts/mocks/ERC721BasicTokenMock.sol';
import {ERC721ReceiverMock} from '../zeppelin/contracts/mocks/ERC721ReceiverMock.sol';
import {ERC721TokenMock} from '../zeppelin/contracts/mocks/ERC721TokenMock.sol';
import {ERC223TokenMock} from '../zeppelin/contracts/mocks/ERC223TokenMock.sol';
import {PausableMock} from '../zeppelin/contracts/mocks/PausableMock.sol';
import {SafeMathMock} from '../zeppelin/contracts/mocks/SafeMathMock.sol';
import {SafeERC20Helper} from '../zeppelin/contracts/mocks/SafeERC20Helper.sol';
import {ReentrancyAttack} from '../zeppelin/contracts/mocks/ReentrancyAttack.sol';
import {ReentrancyMock} from '../zeppelin/contracts/mocks/ReentrancyMock.sol';

contract MockInclude {
	constructor() public {

	}
}
