# Crypto Splitter

Transfer crypto to multiple addresses in configurable quantities. Save gas!

## Configuration

Configuration is found in the `/config` directory. Remove the `.example` from the following files:

* config.example.js
* payments.example.csv

### General Config (`/config/config.js`)

This file contains the implementation details of the payments. Which token are you using? Is there a multisig involved?

| Property | Description |
| -------- | ----------- |
| **CHUNK** | Maximum number of payments/distributions to be included in a batched transaction. |
| **SPLITTER** | Address of the deployed Splitter contract. |
| **MULTISIG** | Address of the multisg being used. `null` if a multisig wallet is not being used. |
| **MULTISIG_TYPE** | Type of the multisg being used. Valid values are `GNOSIS_MULTISIG`, `GNOSIS_SAFE`, and `null` if a multisig wallet is not being used. |
| **WALLET** | Address of the wallet submitting (and paying gas) for the initial transaction. |
| **KEY** | Private key of the WALLET mentioned above. |
| **RPC** | Json rpc of the network being used. |

### Payments (`/config/payments.csv`)

This file contains the data for amounts to be sent and to whom. This is a comma separated text file with no headers 
where each row contains five entries ordered as such:

1st: Friendly Payee Name

2nd: Payee Address

3rd: Payment Friendly Amount

4th: Payment Token Address (`AVAX` when paying with AVAX)


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
   * Send varying amounts of a token to a list of payees
2) Pay AVAX
   * Send varying amounts of AVAX to a list of payees
3) Distribute ERC20
   * Send a fixed amount of a token to a list of payees
4) Distribute AVAX
    * Send a fixed amount of AVAX to a list of payees
    
### Easy Method for Paying

The app determines which of the methods above is most efficient based on the provided payment csv.

```bash
# Gives Splitter an unlimited allowance to spend the multisig or wallet's erc20 token
npm run approve

# Display a graphical overview of payments, and then execute after a 15 second "cold-feet" delay
npm run pay
```

<div style="text-align: center;">
    <img src="https://github.com/bmino/crypto-splitter/blob/master/resources/paymentPreview.png?raw=true" alt="Payment preview">
</div>
