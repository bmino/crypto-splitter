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

  // Display friendly UI of payments
  const table = PAYMENTS.map(p => ({
    payee: Object.keys(SUPPLIERS).find(key => SUPPLIERS[key].ADDRESS === p.ADDRESS),
    address: p.ADDRESS.toLowerCase(),
    amount: p.AMOUNT,
    friendlyValue: Util.convertBNtoFloat(Web3.utils.toBN(p.AMOUNT), decimals).toLocaleString('en-US', {minimumFractionDigits: 2}),
    token: symbol,
  }));
  console.table(table);

  // Create actual payment tx
  console.log(`Creating payment splitter transaction ...`);
  const paymentTX = await splitter.methods.pay(
    TOKEN,
    PAYMENTS.map(p => p.ADDRESS),
    PAYMENTS.map(p => p.AMOUNT),
  );
  const paymentBytecode = paymentTX.encodeABI();
  console.log(`Bytecode:`)
  console.log(paymentBytecode);
  console.log();

  console.log(`Checking balance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} ...`);
  const balance = await token.methods.balanceOf(MULTISIG ? MULTISIG : WALLET).call();
  console.log(`Balance: ${Util.convertStringToFloat(balance, decimals)} ${symbol}`);
  console.log();

  console.log(`Checking allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
  const allowance = await token.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
  console.log(`Allowance: ${Util.convertStringToFloat(allowance, decimals)} ${symbol}`);
  console.log();

  console.log(`Estimating gas ...`);
  const gas = await paymentTX.estimateGas({ from: WALLET });
  const gasPrice = await web3.eth.getGasPrice();
  console.log(`Estimated gas: ${Util.convertFloatToString(parseInt(gas) * gasPrice, 18)} AVAX`);
  console.log();


  console.log(`Will send transaction in 15 seconds ...`);
  await new Promise(resolve => setTimeout(resolve, 15000));
  console.log();


  if (MULTISIG) {
    console.log(`Submitting transaction to multisig ...`);

    const multisigTX = multi.methods.submitTransaction(
      SPLITTER,
      0,
      paymentBytecode,
    );

    return multisigTX.send({
      from: WALLET,
      gas,
      gasPrice,
    });
  } else {
    console.log(`Sending transaction ...`);

    return paymentTX.send({
      from: WALLET,
      gas,
      gasPrice,
    });
  }

})()
  .then(console.log)
  .catch(console.error)
  .finally(process.exit);
