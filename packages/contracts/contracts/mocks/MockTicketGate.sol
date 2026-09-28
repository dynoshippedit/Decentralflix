// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockTicketGate
 * @dev TEST-ONLY mock. Stands in for the MovieTicket access/delist views that
 * Reviews.sol calls (`hasAccessToVideo` and `isFilmDelisted`). It lets tests
 * exercise the real review logic without depending on MovieTicket's on-chain
 * access check (which is a Phase-0 stub that always returns false).
 *
 * NOT for deployment — never referenced by scripts/deploy.ts.
 */
contract MockTicketGate {
    bool public globalAccess;
    mapping(address => mapping(bytes32 => bool)) public access;
    mapping(bytes32 => bool) private delisted;

    function setGlobalAccess(bool v) external {
        globalAccess = v;
    }

    function setAccess(address user, string calldata videoHash, bool v) external {
        access[user][keccak256(bytes(videoHash))] = v;
    }

    function setDelisted(string calldata videoHash, bool v) external {
        delisted[keccak256(bytes(videoHash))] = v;
    }

    function hasAccessToVideo(address user, string memory videoHash) public view returns (bool) {
        return globalAccess || access[user][keccak256(bytes(videoHash))];
    }

    function isFilmDelisted(string memory videoHash) public view returns (bool) {
        return delisted[keccak256(bytes(videoHash))];
    }
}
