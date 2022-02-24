const CONFIG = require('../../config/config');
const Safe = require('@gnosis.pm/safe-core-sdk').default;
const { OperationType } = require('@gnosis.pm/safe-core-sdk-types/dist/src/types');
const SafeServiceClient = require('@gnosis.pm/safe-service-client').default;
const Web3Adapter = require('@gnosis.pm/safe-web3-lib').default;

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.RPC));
web3.eth.accounts.wallet.add(CONFIG.KEY);

const safeService = new SafeServiceClient('https://safe-transaction.avalanche.gnosis.io');
const adapter = new Web3Adapter({
    web3,
    signerAddress: web3.eth.accounts.wallet[0].address,
});

const propose = async ({ multisigAddress, destination, value, bytecode }) => {
    const safeSdk = await Safe.create({
        ethAdapter: adapter,
        safeAddress: multisigAddress,
    });

    const baseTxn = {
        to: destination,
        value: value.toString(),
        data: bytecode,
        operation: OperationType.Call,
    };

    const { safeTxGas } = await safeService.estimateSafeTransaction(multisigAddress, baseTxn);

    const safeTxData = {
        ...baseTxn,
        safeTxGas: parseInt(safeTxGas),
        nonce: await safeService.getNextNonce(multisigAddress),
        baseGas: 0,
        gasPrice: 0,
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
    };

    const safeTransaction = await safeSdk.createTransaction(safeTxData);
    await safeSdk.signTransaction(safeTransaction);

    return await safeService.proposeTransaction({
        safeAddress: multisigAddress,
        senderAddress: web3.eth.accounts.wallet[0].address,
        safeTransaction,
        safeTxHash: await safeSdk.getTransactionHash(safeTransaction),
    });
};

module.exports = {
    propose,
};
