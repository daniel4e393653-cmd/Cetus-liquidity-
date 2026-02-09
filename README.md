# Cetus Liquidity Simple Rebalance Bot

A simple automatic liquidity rebalancing bot for Cetus Protocol on the Sui Network. This bot monitors a single liquidity position and automatically rebalances it when the market price moves outside the optimal range.

## Features

- ✅ **Simple Single Position Monitoring**: Tracks one configured liquidity position
- ✅ **Automatic Rebalancing**: Rebalances when price moves outside optimal range
- ✅ **Configurable Amounts**: Use fixed token amounts for each rebalance
- ✅ **Basic Risk Management**: Slippage protection and gas budget controls
- ✅ **Clean Logging**: Clear logging with configurable verbosity
- ✅ **TypeScript**: Full TypeScript support with type safety

## What's Different in Simple Mode

This is a **simplified version** that focuses on core functionality:
- **Requires POSITION_ID**: You must specify which position to track
- **Requires TOKEN_A_AMOUNT and TOKEN_B_AMOUNT**: Fixed amounts for rebalancing
- **No coin merging**: Assumes coins are already merged
- **No token swapping**: Requires balanced token amounts
- **No multi-position tracking**: Manages exactly one position
- **Simple retry logic**: Basic 2-attempt retry instead of complex backoff

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- A Sui wallet with funds
- Access to a Sui RPC endpoint (or use default public endpoints)

## Installation

### Quick Setup

Run the automated setup script:
```bash
git clone https://github.com/daniel4e393653-cmd/Cetus-liquidity-.git
cd Cetus-liquidity-
npm run setup
```

This will:
- Install all dependencies
- Create a `.env` file from `.env.example`
- Display next steps

Then edit the `.env` file with your configuration (see Configuration section below).

### Manual Setup

1. Clone the repository:
```bash
git clone https://github.com/daniel4e393653-cmd/Cetus-liquidity-.git
cd Cetus-liquidity-
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Configure your environment variables (see Configuration section below)

## Configuration

Edit the `.env` file with your settings:

### Required Settings

```env
# Your Sui wallet private key (64-character hex string)
PRIVATE_KEY=your_private_key_here

# The pool address you want to manage
POOL_ADDRESS=0x...

# The specific position ID to track and rebalance (REQUIRED)
POSITION_ID=0x...

# Token amounts for rebalancing (REQUIRED)
TOKEN_A_AMOUNT=1000000
TOKEN_B_AMOUNT=1000000
```

### Optional Settings

```env
# Network (mainnet or testnet)
NETWORK=mainnet

# Custom RPC endpoint (leave empty for default)
SUI_RPC_URL=

# How often to check positions (in seconds)
CHECK_INTERVAL=300

# Rebalance when price moves this % outside range
REBALANCE_THRESHOLD=0.05

# Position tick boundaries (optional - will auto-calculate if not set)
LOWER_TICK=
UPPER_TICK=
RANGE_WIDTH=

# Maximum slippage tolerance (1% = 0.01)
MAX_SLIPPAGE=0.01

# Gas budget in MIST (1 SUI = 1,000,000,000 MIST)
GAS_BUDGET=100000000

# Logging
LOG_LEVEL=info
VERBOSE_LOGS=false
```

## Usage

### Build the Bot

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Run in Production

```bash
npm start
```

The bot will:
1. Initialize and connect to the Sui network
2. Load your wallet and verify access
3. Validate the configured position exists
4. Start monitoring your position
5. Automatically rebalance when needed using configured token amounts
6. Log all activities

### Stop the Bot

Press `Ctrl+C` to gracefully stop the bot.

## How It Works

1. **Monitoring**: The bot periodically checks your configured liquidity position against the current pool price
2. **Range Analysis**: It calculates if the current price is outside your position range
3. **Rebalance Decision**: If the price is out of range or too close to boundaries, it triggers a rebalance
4. **Execution**: The bot:
   - Removes all liquidity from the old position
   - Creates a new position centered around the current price
   - Uses the configured TOKEN_A_AMOUNT and TOKEN_B_AMOUNT
5. **Logging**: All actions are logged for transparency

## Security Considerations

⚠️ **Important Security Notes:**

- **Never commit your `.env` file** - it contains your private key
- **Use a dedicated wallet** - Don't use your main wallet for the bot
- **Start with small amounts** - Test with small TOKEN_A_AMOUNT and TOKEN_B_AMOUNT first
- **Monitor regularly** - Check bot logs and position performance
- **Keep private key secure** - Store it encrypted when possible
- **Use testnet first** - Always test on testnet before mainnet
- **Pre-merge coins** - Simple bot doesn't merge coins automatically
- **Have balanced tokens** - Ensure you have both tokens available

## Project Structure

```
.
├── src/
│   ├── config/                # Configuration management
│   │   └── index.ts
│   ├── services/              # Core services
│   │   ├── sdk.ts            # Cetus SDK initialization
│   │   ├── monitor.ts        # Position monitoring
│   │   └── rebalance-simple.ts # Simple rebalance logic
│   ├── utils/                # Utilities
│   │   └── logger.ts         # Logging utility
│   ├── bot.ts                # Main bot class
│   └── index.ts              # Entry point
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── README.md                # This file
```

## Troubleshooting

### Bot won't start

- Check that all required environment variables are set (PRIVATE_KEY, POOL_ADDRESS, POSITION_ID, TOKEN_A_AMOUNT, TOKEN_B_AMOUNT)
- Verify your private key format (64-character hex string)
- Ensure your wallet has sufficient SUI for gas fees
- Verify the POSITION_ID exists and belongs to your wallet

### "Invalid private key format" error

- Remove any `0x` prefix from your private key
- Ensure it's exactly 64 hexadecimal characters
- Verify you're using the Ed25519 private key, not the public key

### Position not rebalancing

- Check that `REBALANCE_THRESHOLD` is appropriate (0.05 = 5%)
- Verify the pool has enough liquidity
- Check logs for any errors during rebalance attempts
- Ensure you have enough TOKEN_A and TOKEN_B in your wallet (at least TOKEN_A_AMOUNT and TOKEN_B_AMOUNT)
- Make sure coins are already merged (simple bot doesn't merge automatically)

### High gas costs

- Increase `CHECK_INTERVAL` to check less frequently
- Increase `REBALANCE_THRESHOLD` to rebalance less often
- Adjust `GAS_BUDGET` if transactions are failing

## Development

### Building

```bash
npm run build
```

### Cleaning

```bash
npm run clean
```

### Code Structure

The bot follows a simple service-oriented architecture:

- **CetusSDKService**: Manages SDK initialization and wallet operations
- **PositionMonitorService**: Monitors positions and pool state
- **SimpleRebalanceService**: Handles simple rebalancing logic with fixed amounts
- **CetusRebalanceBot**: Orchestrates all services and manages the bot lifecycle

## Advanced Configuration

### Custom Range Calculation

By default, the bot calculates optimal ranges based on:
- Current tick index
- Pool tick spacing

The new position is created around the current price with appropriate tick spacing.

### Multiple Pools

To manage multiple pools, run multiple instances of the bot with different `.env` files.
Each bot instance manages one position in one pool.

```bash
# Terminal 1
NODE_ENV=pool1 npm start

# Terminal 2  
NODE_ENV=pool2 npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Disclaimer

This bot is provided as-is for educational and experimental purposes. Use at your own risk. The authors are not responsible for any losses incurred through the use of this software. Always test thoroughly on testnet before using on mainnet with real funds.

## Resources

- [Cetus Protocol](https://www.cetus.zone/)
- [Cetus CLMM SDK](https://github.com/CetusProtocol/cetus-clmm-sui-sdk)
- [Sui Network](https://sui.io/)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the logs for error details

---

Made with ❤️ for the Sui and Cetus communities