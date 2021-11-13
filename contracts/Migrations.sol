pragma solidity ^0.4.19;

contract Migrations {
	address public owner;
	uint public last_completed_migration;

	modifier restricted() {
		if (msg.sender == owner) _;
	}

	constructor() public {
		owner = msg.sender;
	}

	function setCompleted(uint completed) public view restricted {
		completed = completed;
		//last_completed_migration = completed;
	}

	function upgrade(address new_address) public view restricted {
		Migrations upgraded = Migrations(new_address);
		upgraded.setCompleted(last_completed_migration);
	}
}
