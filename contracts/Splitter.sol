pragma solidity 0.8.4;

/// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Splitter is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event PaymentERC20(address payee, uint256 payment, address token);
    event PaymentAVAX(address payee, uint256 payment);

    constructor() {}

    function pay(
        address token,
        address[] calldata payees,
        uint256[] calldata amounts
    ) public {
        require(
            payees.length == amounts.length,
            "Splitter::pay: INVALID_INPUT_LENGTH"
        );

        IERC20 erc20 = IERC20(token);

        for (uint256 i; i < payees.length; i++) {
            erc20.safeTransferFrom(msg.sender, payees[i], amounts[i]);
            emit PaymentERC20(payees[i], amounts[i], token);
        }
    }

    function payAVAX(
        address payable[] calldata payees,
        uint256[] calldata amounts
    ) public payable nonReentrant {
        require(
            payees.length == amounts.length,
            "Splitter::payAVAX: INVALID_INPUT_LENGTH"
        );

        for (uint256 i; i < payees.length; i++) {
            Address.sendValue(payees[i], amounts[i]);
            emit PaymentAVAX(payees[i], amounts[i]);
        }
    }

    function distribute(
        address token,
        uint256 amount,
        address[] calldata payees
    ) public {
        IERC20 erc20 = IERC20(token);

        require(
            erc20.balanceOf(msg.sender) >= amount.mul(payees.length),
            "Splitter::distribute: INSUFFICIENT_BALANCE"
        );

        require(
            erc20.allowance(msg.sender, address(this)) >= amount.mul(payees.length),
            "Splitter::distribute: INSUFFICIENT_ALLOWANCE"
        );

        for (uint256 i; i < payees.length; i++) {
            erc20.safeTransferFrom(msg.sender, payees[i], amount);
            emit PaymentERC20(payees[i], amount, token);
        }
    }

    function distributeAVAX(
        uint256 amount,
        address payable[] calldata payees
    ) public payable nonReentrant {
        require(
            address(this).balance >= amount.mul(payees.length),
            "Splitter::distributeAVAX: INSUFFICIENT_BALANCE"
        );

        for (uint256 i; i < payees.length; i++) {
            Address.sendValue(payees[i], amount);
            emit PaymentAVAX(payees[i], amount);
        }
    }
}
