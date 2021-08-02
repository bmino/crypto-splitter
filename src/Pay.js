const { TOKEN, SPLITTER, MULTISIG, WALLET, KEY, RPC } = require('../config/config');
const ABI = require('../config/abi');
const PAYMENTS = require('../config/payments');
const SUPPLIERS = require('../config/suppliers');
const Util = require('./Util');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(RPC));
web3.eth.accounts.wallet.add(KEY);

// Contracts
const token = new web3.eth.Contract(ABI.ERC20, TOKEN);
const splitter = new web3.eth.Contract(ABI.SPLITTER, SPLITTER);
const multi = MULTISIG ? new web3.eth.Contract(ABI.GNOSIS_MULTISIG, MULTISIG) : null;

(async () => {

  const symbol = await token.methods.symbol().call();
  const decimals = parseInt(await token.methods.decimals().call());
  const gasPrice = await web3.eth.getGasPrice();

  const PAYMENT_ADDRESSES = PAYMENTS.map(entry => entry[0]);
  const PAYMENT_AMOUNTS = PAYMENTS.map(entry => entry[1]);

  // Warn about duplicate addresses
  Object.values(SUPPLIERS)
    .filter((address, index, addresses) => addresses.indexOf(address) !== index)
    .forEach(address => {
      const namesUsed = Object.entries(SUPPLIERS).filter(([n, a]) => a === address).map(([name,]) => name);
      console.warn(`Duplicate address ${address}: [${namesUsed}]`);
    });

  // Display friendly UI of payments
  const table = PAYMENTS.map(([address, amount]) => ({
    name: Object.keys(SUPPLIERS).find(name => SUPPLIERS[name] === address),
    address,
    amount,
    friendlyValue: Util.convertBNtoFloat(Web3.utils.toBN(amount), decimals).toLocaleString('en-US', {minimumFractionDigits: 2}),
    token: symbol,
  }));
  console.table(table);

  // Create actual payment tx
  console.log(`Encoding tx and bytecode ...`);
  const directPaymentTX = await splitter.methods.pay(
    TOKEN,
    PAYMENT_ADDRESSES,
    PAYMENT_AMOUNTS,
  );
  const paymentBytecode = directPaymentTX.encodeABI();
  console.log(`Bytecode:`)
  console.log(paymentBytecode);
  console.log();

  console.log(`Calculating total sum of ${PAYMENT_AMOUNTS.length} payments ...`);
  const paymentSumBN = PAYMENT_AMOUNTS
    .map(Util.toBN)
    .reduce((sum, payment) => sum.add(payment), Util.BN_ZERO);
  const paymentSum = Util.convertBNtoFloat(paymentSumBN, decimals);
  console.log(`Total: ${paymentSum.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  console.log(`Checking balance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} ...`);
  const balanceString = await token.methods.balanceOf(MULTISIG ? MULTISIG : WALLET).call();
  const balance = Util.convertStringToFloat(balanceString, decimals);
  console.log(`Balance: ${balance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (paymentSum > balance) {
    throw new Error(`Insufficient balance to fund payments!`);
  }

  console.log(`Checking allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
  const allowanceString = await token.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
  const allowance = Util.convertStringToFloat(allowanceString, decimals);
  console.log(`Allowance: ${allowance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (paymentSum > allowance) {
    throw new Error(`Insufficient allowance to fund payments!`);
  }

  if (MULTISIG) {
    // Create multisig transaction
    const multisigPaymentTX = multi.methods.submitTransaction(
      SPLITTER,
      0,
      paymentBytecode,
    );

    console.log(`Estimating gas for multisig submission ...`);
    const gasForSubmission = await multisigPaymentTX.estimateGas({ from: WALLET });
    console.log(`Estimated gas for submission: ${(parseInt(gasForSubmission) / (10 ** 18) * gasPrice).toFixed(4)} AVAX`);
    console.log();

    console.log(`Estimating gas for multisig execution ...`);
    const gasForExecution = await directPaymentTX.estimateGas({ from: MULTISIG });
    console.log(`Estimated gas for execution: ${(parseInt(gasForExecution) / (10 ** 18) * gasPrice).toFixed(4)} AVAX`);
    console.log();

    console.log(`Will send multisig transaction in 15 seconds ...`);
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log();

    console.log(`Submitting transaction to multisig ...`);

    return multisigPaymentTX.send({
      from: WALLET,
      gas: gasForSubmission,
      gasPrice,
    });
  } else {
    console.log(`Estimating gas ...`);
    const gas = await directPaymentTX.estimateGas({ from: WALLET });
    console.log(`Estimated gas: ${(parseInt(gas) / (10 ** 18) * gasPrice).toFixed(4)} AVAX`);
    console.log();

    console.log(`Will send transaction in 15 seconds ...`);
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log();

    console.log(`Sending transaction ...`);

    return directPaymentTX.send({
      from: WALLET,
      gas,
      gasPrice,
    });
  }

})()
  .then(console.log)
  .catch(console.error)
  .finally(process.exit);
