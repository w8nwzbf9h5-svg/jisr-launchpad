// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 Jisr Launchpad. All rights reserved. See the LICENSE file.
pragma solidity 0.8.26;

/// Test stand-in for Circle's MessageTransmitterV2 on the destination network.
contract MockTransmitter {
    mapping(bytes32 => bool) public used;
    uint256 public received;

    event Received(address caller, bytes message, bytes attestation);

    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool) {
        bytes32 id = keccak256(message);
        require(!used[id], "Nonce already used");
        require(attestation.length > 0, "Invalid attestation length");
        used[id] = true;
        received += 1;
        emit Received(msg.sender, message, attestation);
        return true;
    }
}
