// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ValoraStakedCell is ERC20, Ownable {
    address public coreContract;

    // Events
    event CoreContractUpdated(address indexed oldCore, address indexed newCore);

    constructor() ERC20("Valora Staked Cell", "sCELL") Ownable(msg.sender) {}

    modifier onlyCore() {
        require(msg.sender == coreContract, "Only core contract allowed");
        _;
    }

    function setCoreContract(address _core) external onlyOwner {
        require(_core != address(0), "Invalid core contract address");
        address oldCore = coreContract;
        coreContract = _core;
        emit CoreContractUpdated(oldCore, _core);
    }

    function mint(address to, uint256 amount) external onlyCore {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");
        _mint(to, amount);
    }

    function burn(uint256 amount) external onlyCore {
        require(amount > 0, "Amount must be greater than 0");
        _burn(address(this), amount);
    }
}