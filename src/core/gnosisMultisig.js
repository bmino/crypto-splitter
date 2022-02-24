const CONFIG = require('../../config/config');
const ABI = require('../../config/abi');

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.RPC));
web3.eth.accounts.wallet.add(CONFIG.KEY);

const propose = async ({ multisigAddress, destination, value, bytecode, nonce }) => {
    const multisigContract = new web3.eth.Contract(ABI.GNOSIS_MULTISIG, multisigAddress);

    const tx = multisigContract.methods.submitTransaction(destination, value, bytecode);

    const gas = await tx.estimateGas({ from: CONFIG.WALLET });
    const baseGasPrice = await web3.eth.getGasPrice();

    const txConfig = {
        from: CONFIG.WALLET,
        gas,
        maxFeePerGas: baseGasPrice * 2,
        maxPriorityFeePerGas: web3.utils.toWei('2', 'nano'),
    };

    // Conditionally specify nonce
    if (nonce !== undefined) txConfig.nonce = nonce;

    return tx.send(txConfig);
};

module.exports = {
    propose,
};
