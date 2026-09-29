// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockFeeRecipients
 * @dev TEST-ONLY mocks for the F-DFLIX-1 owner-rotation receive-capability
 * guard in RevenueSplitter. A RevertingReceiver stands in for an owner
 * address that cannot receive the platform fee (which used to brick every
 * paid flow); an AcceptingReceiver is the well-behaved control.
 *
 * NOT for deployment - never referenced by scripts/deploy.ts.
 */

/// @dev Reverts on any ETH receipt: installing this as the platform owner
/// would brick buyAccess/subscribe/renew/mint flows that push the fee.
contract RevertingReceiver {
    receive() external payable {
        revert("MockFeeRecipients: cannot receive ETH");
    }
}

/// @dev Accepts ETH: the control recipient that a legitimate owner rotation
/// to a contract wallet / multisig must behave like.
contract AcceptingReceiver {
    receive() external payable {}
}
