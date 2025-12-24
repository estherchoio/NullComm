// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted messenger using Zama FHE for key delivery
/// @notice Stores messages encrypted off-chain and protects the key on-chain
contract EncryptedMessenger is ZamaEthereumConfig {
    struct Message {
        address sender;
        string encryptedMessage;
        eaddress encryptedKey;
        uint256 timestamp;
    }

    mapping(address => Message[]) private _messages;

    event MessageSent(address indexed sender, address indexed recipient, uint256 index);

    /// @notice Send an encrypted message to a recipient
    /// @param recipient Address that will receive the message
    /// @param encryptedMessage Ciphertext produced off-chain
    /// @param encryptedKey Encrypted address key (Zama input)
    /// @param inputProof Proof for the encrypted input
    function sendMessage(
        address recipient,
        string calldata encryptedMessage,
        externalEaddress encryptedKey,
        bytes calldata inputProof
    ) external {
        require(recipient != address(0), "Invalid recipient");
        require(bytes(encryptedMessage).length > 0, "Empty message");

        eaddress key = FHE.fromExternal(encryptedKey, inputProof);

        _messages[recipient].push(
            Message({
                sender: msg.sender,
                encryptedMessage: encryptedMessage,
                encryptedKey: key,
                timestamp: block.timestamp
            })
        );

        FHE.allowThis(key);
        FHE.allow(key, recipient);

        emit MessageSent(msg.sender, recipient, _messages[recipient].length - 1);
    }

    /// @notice Returns the number of messages for a recipient
    /// @param recipient Address to query
    function getMessageCount(address recipient) external view returns (uint256) {
        return _messages[recipient].length;
    }

    /// @notice Returns a message by index for a recipient
    /// @param recipient Address to query
    /// @param index Message index
    function getMessageAt(
        address recipient,
        uint256 index
    ) external view returns (address sender, string memory encryptedMessage, eaddress encryptedKey, uint256 timestamp) {
        Message storage message = _messages[recipient][index];
        return (message.sender, message.encryptedMessage, message.encryptedKey, message.timestamp);
    }
}
