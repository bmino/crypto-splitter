const {CHUNK, SPLITTER, MULTISIG, MULTISIG_TYPE, WALLET, KEY, RPC} = require('../config/config');
const ABI = require('../config/abi');
const Util = require('./Util');
const Web3 = require('web3');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const {CSV_HEADERS, GNOSIS_MULTISIG, GNOSIS_SAFE} = require('./core/constants');
const {propose: gnosisMultisigPropose} = require('./core/gnosisMultisig');
const {propose: gnosisSafePropose} = require('./core/gnosisSafe');
const web3 = new Web3(new Web3.providers.HttpProvider(RPC));
web3.eth.accounts.wallet.add(KEY);

(async () => {
  const PAYMENTS = await new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('../config/payments.csv')
      .pipe(csv(CSV_HEADERS))
      .on('data', data => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

  if (PAYMENTS.some((payment) => Object.entries(payment).length !== CSV_HEADERS.length)) {
    throw new Error(`Invalid CSV entry! All entries must have ${CSV_HEADERS.length} values`);
  }

  const TOKEN = PAYMENTS[0].token;

  if (TOKEN !== 'AVAX' && !web3.utils.isAddress(TOKEN.toLowerCase())) {
    throw new Error(`Invalid first token address (${TOKEN})`);
  }

  // Contracts
  const token = TOKEN === 'AVAX' ? null : new web3.eth.Contract(ABI.ERC20, TOKEN.toLowerCase());
  const splitter = new web3.eth.Contract(ABI.SPLITTER, SPLITTER);

  const symbol = TOKEN === 'AVAX' ? 'AVAX' : await token.methods.symbol().call();
  const decimals = TOKEN === 'AVAX' ? 18 : parseInt(await token.methods.decimals().call());

  console.log(`Checking payment assets ...`);
  if (!PAYMENTS.every(({token}) => token === 'AVAX' || web3.utils.isAddress(token.toLowerCase()))) {
    const {token: alternateToken} = PAYMENTS.find(({token}) => token !== 'AVAX' && !web3.utils.isAddress(token.toLowerCase()));
    throw new Error(`Provided CSV token entry ${alternateToken} must be 'AVAX' or a token address`);
  }
  if (PAYMENTS.some(({token}) => token.toLowerCase() !== TOKEN.toLowerCase())) {
    const {token: alternateToken} = PAYMENTS.find(({token}) => token.toLowerCase() !== TOKEN.toLowerCase());
    throw new Error(`Provided CSV token entry ${alternateToken} should match configured payment token ${symbol}`);
  }

  console.log(`Calculating total sum of ${PAYMENTS.length} payments ...`);
  const paymentSumBN = PAYMENTS.map(({amount}) => Util.convertFloatToBN(parseFloat(amount), decimals))
    .reduce((sum, payment) => sum.add(payment), Util.BN_ZERO);
  const paymentSum = Util.convertBNtoFloat(paymentSumBN, decimals);
  console.log(`Sum: ${paymentSum.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  console.log(`Checking balance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} ...`);
  const balanceString = TOKEN === 'AVAX'
    ? await web3.eth.getBalance(MULTISIG ? MULTISIG : WALLET)
    : await token.methods.balanceOf(MULTISIG ? MULTISIG : WALLET).call();
  const balance = Util.convertStringToFloat(balanceString, decimals);
  console.log(`Balance: ${balance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (paymentSum > balance) {
    throw new Error(`Insufficient ${symbol} balance to fund payments!`);
  }

  if (TOKEN !== 'AVAX') {
    console.log(`Checking allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
    const allowanceString = await token.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
    const allowance = Util.convertStringToFloat(allowanceString, decimals);
    console.log(`Allowance: ${allowance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
    console.log();

    if (paymentSum > allowance) {
      throw new Error(`Insufficient ${symbol} allowance to fund payments!`);
    }
  }

  // Warn about duplicate payments
  console.log(`Checking for duplicate payments ...`);
  PAYMENTS.filter(({payee}, index) => PAYMENTS.indexOf(payee) !== index)
    .forEach(({payee: duplicateAddress}) => {
      const namesUsed = PAYMENTS.filter(({payee}) => payee.toLowerCase() === duplicateAddress.toLowerCase()).map(({name}) => name);
      console.warn(`Multiple payments to address ${duplicateAddress}: [${namesUsed.join(', ')}]`);
    });
  console.log();

  // Warn about invalid addresses
  console.log(`Checking for invalid addresses ...`);
  const invalidAddresses = PAYMENTS.map(({payee}) => payee).filter((address) => !web3.utils.isAddress(address.toLowerCase()));
  if (invalidAddresses.length > 0) {
    invalidAddresses.forEach((address) => console.warn(`Invalid address ${address}`));
    throw new Error(`${invalidAddresses.length} invalid addresses detected!`);
  }
  console.log();

  // Warn about 0 value payments
  console.log(`Checking for empty payments ...`);
  const emptyPaymentPayees = PAYMENTS.filter(({amount}) => parseInt(amount) === 0).map(({payee}) => payee);
  if (emptyPaymentPayees.length > 0) {
    emptyPaymentPayees.forEach((payee) => console.warn(`Empty payment to ${payee}`));
    throw new Error(`${emptyPaymentPayees.length} empty payments detected!`);
  }
  console.log();

  // Split into multiple tx's if required
  console.log(`Splitting into batches if necessary ...`);
  const PAYMENT_BATCHES = Util.chunk(PAYMENTS, CHUNK);
  console.log(`Split into ${PAYMENT_BATCHES.length} ${PAYMENT_BATCHES.length > 1 ? 'batches' : 'batch'} of [${PAYMENT_BATCHES.map(batch => batch.length)}] payments`);

  const tables = [];
  const paymentTXs = [];
  const paymentSums = [];

  for (const payments of PAYMENT_BATCHES) {
    const index = PAYMENT_BATCHES.indexOf(payments);

    const table = payments.map(({name, payee, amount, token}) => ({
      name,
      payee,
      amount: parseFloat(amount).toLocaleString('en-US', {minimumFractionDigits: 2}),
      onChainAmount: Util.convertFloatToString(parseFloat(amount), decimals),
      token,
    }));
    tables.push(table);

    const batchPaymentSum = table.map(({onChainAmount}) => onChainAmount)
      .map(Util.toBN)
      .reduce((sum, amountBN) => sum.add(amountBN), Util.BN_ZERO);
    paymentSums.push(batchPaymentSum);

    // Determine transaction method
    if (TOKEN === 'AVAX') {
      if (table.every(({onChainAmount}) => onChainAmount === table[0].onChainAmount)) {
        console.log(`Using 'distributeAVAX' method for batch #${index + 1}`);
        paymentTXs.push(splitter.methods.distributeAVAX(
          table[0].onChainAmount,
          table.map(({payee}) => payee),
        ));
      } else {
        console.log(`Using 'payAVAX' method for batch #${index + 1}`);
        paymentTXs.push(splitter.methods.payAVAX(
          table.map(({payee}) => payee),
          table.map(({onChainAmount}) => onChainAmount),
        ));
      }
    } else {
      if (table.every(({onChainAmount}) => onChainAmount === table[0].onChainAmount)) {
        console.log(`Using 'distribute' method for batch #${index + 1}`);
        paymentTXs.push(splitter.methods.distribute(
          TOKEN,
          table[0].onChainAmount,
          table.map(({payee}) => payee),
        ));
      } else {
        console.log(`Using 'pay' method for batch #${index + 1}`);
        paymentTXs.push(splitter.methods.pay(
          TOKEN,
          table.map(({payee}) => payee),
          table.map(({onChainAmount}) => onChainAmount),
        ));
      }
    }
  }

  // Display all tables
  tables.forEach(table => console.table(table));

  // Display all bytecode
  console.log(`Encoding bytecode ...`);
  paymentTXs.forEach((tx, i) => {
    const txsIncluded = tx.arguments[1].length;
    const txsSubmitted = CHUNK * i;

    const bytecode = tx.encodeABI();
    const fileOutput = `./${path.basename(__filename, '.js')}-${symbol}-bytecode-${i}.txt`;
    fs.writeFileSync(fileOutput, bytecode);

    console.log(`Bytecode for ${txsIncluded} payments (${txsSubmitted + 1}-${txsSubmitted + txsIncluded}) written to ${fileOutput}`);
  });
  console.log();

  for (const paymentTX of paymentTXs) {
    const batchIndex = paymentTXs.indexOf(paymentTX);
    if (MULTISIG) {
      switch (MULTISIG_TYPE) {
        case GNOSIS_MULTISIG:
          console.log(`Will propose to gnosis multisig in 15 seconds ...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
          console.log();

          console.log(`Proposing transaction to gnosis multisig ...`);

          await gnosisMultisigPropose({
            multisigAddress: MULTISIG,
            destination: SPLITTER,
            value: TOKEN === 'AVAX' ? paymentSums[batchIndex].toString() : 0,
            bytecode: paymentTX.encodeABI(),
          });
          break;
        case GNOSIS_SAFE:
          console.log(`Will propose to gnosis safe in 15 seconds ...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
          console.log();

          console.log(`Proposing transaction to gnosis safe ...`);

          await gnosisSafePropose({
            multisigAddress: MULTISIG,
            destination: SPLITTER,
            value: TOKEN === 'AVAX' ? paymentSums[batchIndex].toString() : 0,
            bytecode: paymentTX.encodeABI(),
          });
          break;
        default:
          throw new Error(`Unsupported multisig type: ${MULTISIG_TYPE}`);
      }
    } else {
      console.log(`Estimating gas ...`);
      const gas = await paymentTX.estimateGas({from: WALLET});
      const gasPrice = await web3.eth.getGasPrice();
      console.log(`Estimated gas: ${gas.toLocaleString('en-us')} (${(parseInt(gas) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Will send transaction directly in 15 seconds ...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.log();

      const baseGasPrice = await web3.eth.getGasPrice();

      console.log(`Sending transaction ...`);

      await paymentTX.send({
        from: WALLET,
        value: TOKEN === 'AVAX' ? paymentSums[batchIndex].toString() : 0,
        gas,
        maxFeePerGas: baseGasPrice * 2,
        maxPriorityFeePerGas: web3.utils.toWei('2', 'nano'),
      });
    }
  }
})()
  .then(console.log)
  .catch(console.error)
  .finally(process.exit);
