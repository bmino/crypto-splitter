# Crypto Splitter

Transfer crypto to multiple addresses in configurable quantities. Save gas!

## Configuration

Configuration is found in the `/config` directory. Remove the `.example` from the following files:

* config.example.js
* distributions.example.js
* payments.example.js
* suppliers.example.js

### General Config (`/config/config.js`)

This file contains the implementation details of the payments. Which token are you using? Is there a multisig involved?

| Property | Description |
| -------- | ----------- |
| **TOKEN** | Address of the token being distributed or transferred. Must support `transferFrom()`. This is not used when sending AVAX. |
| **CHUNK** | Maximum number of payments/distributions to be included in a batched transaction. |
| **SPLITTER** | Address of the deployed Splitter contract. |
| **MULTISIG** | Address of the gnosis multisg being used. `null` if a multisig wallet is not being used. |
| **WALLET** | Address of the wallet submitting (and paying gas) for the initial transaction. |
| **KEY** | Private key of the WALLET mentioned above. |
| **RPC** | Json rpc of the network being used. |

### Distributions (`/config/distributions.js`)

This file contains the amount and recipients that should be distributed to.

### Payments (`/config/payments.js`)

This file contains the amounts that are to be sent to each supplier.

### Suppliers (`/config/suppliers.js`)

This file contains a list of suppliers for ease of reference when setting up payments.


## Installation

```bash
npm install
```

## Deploying Splitter Contract

The `.env` file must first be modified to contain a PRIVATE_KEY of the deploying address.
The contract can be deployed to Fuji or the Avalanche mainnet with:

```bash
# Fuji
npm run deployFuji

# Mainnet
npm run deployMain
```

## Executing Splitting!

After setting up the appropriate configuration files, you are ready to send some crypto!
There are four methods of splitting supported:

1) Pay ERC20
   * Send varying amounts of a token to a list of suppliers
2) Pay AVAX
   * Send varying amounts of AVAX to a list of suppliers
3) Distribute ERC20
   * Send a fixed amount of a token to a list of suppliers
4) Distribute AVAX
    * Send a fixed amount of AVAX to a list of suppliers
    
### Easy Method for Paying

The app contains handy shortcuts for using method #1 and #3 above:

```bash
# Gives Splitter an unlimited allowance to spend the multisig or wallet's erc20 token
npm run approve

# Display a graphical overview of payments, and then execute after a 15 second "cold-feet" delay
npm run pay

# Display a graphical overview of distributions, and then execute after a 15 second "cold-feet" delay
npm run distribute
```

<div style="text-align: center;">
    <img src="https://github.com/bmino/crypto-splitter/blob/master/resources/paymentPreview.png?raw=true" alt="Payment preview">
</div>
