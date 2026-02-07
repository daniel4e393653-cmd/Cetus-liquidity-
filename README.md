# Cetus Liquidity Rebalance Bot

An automatic liquidity rebalancing bot for Cetus Protocol on the Sui Network. This bot monitors your liquidity positions and automatically rebalances them when the market price moves outside your specified range, maximizing fee collection and capital efficiency.

## Features

- ✅ **Automatic Position Monitoring**: Continuously monitors your liquidity positions
- ✅ **Smart Rebalancing**: Automatically rebalances when price moves outside optimal range
- ✅ **Configurable Thresholds**: Set custom rebalance thresholds based on your strategy
- ✅ **Risk Management**: Built-in slippage protection and gas budget controls
- ✅ **Comprehensive Logging**: Detailed logging with configurable verbosity
- ✅ **TypeScript**: Full TypeScript support with type safety
- ✅ **Production Ready**: Error handling, retries, and graceful shutdown

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- A Sui wallet with funds
- Access to a Sui RPC endpoint (or use default public endpoints)

## Installation

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

# Token amounts for new positions
TOKEN_A_AMOUNT=
TOKEN_B_AMOUNT=

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
3. Start monitoring your positions
4. Automatically rebalance when needed
5. Log all activities

### Stop the Bot

Press `Ctrl+C` to gracefully stop the bot.

## How It Works

1. **Monitoring**: The bot periodically checks your liquidity positions against the current pool price
2. **Range Analysis**: It calculates how close the current price is to your position boundaries
3. **Rebalance Decision**: If the price is too close to boundaries (within threshold) or out of range, it triggers a rebalance
4. **Execution**: The bot removes liquidity from the old position and creates a new position centered around the current price
5. **Logging**: All actions are logged for transparency and debugging

## Security Considerations

⚠️ **Important Security Notes:**

- **Never commit your `.env` file** - it contains your private key
- **Use a dedicated wallet** - Don't use your main wallet for the bot
- **Start with small amounts** - Test with small liquidity amounts first
- **Monitor regularly** - Check bot logs and position performance
- **Keep private key secure** - Store it encrypted when possible
- **Use testnet first** - Always test on testnet before mainnet

## Project Structure

```
.
├── src/
│   ├── config/           # Configuration management
│   │   └── index.ts
│   ├── services/         # Core services
│   │   ├── sdk.ts       # Cetus SDK initialization
│   │   ├── monitor.ts   # Position monitoring
│   │   └── rebalance.ts # Rebalance logic
│   ├── utils/           # Utilities
│   │   └── logger.ts    # Logging utility
│   ├── bot.ts           # Main bot class
│   └── index.ts         # Entry point
├── .env.example         # Environment template
├── .gitignore          # Git ignore rules
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
└── README.md           # This file
```

## Troubleshooting

### Bot won't start

- Check that all required environment variables are set
- Verify your private key format (64-character hex string)
- Ensure your wallet has sufficient SUI for gas fees

### "Invalid private key format" error

- Remove any `0x` prefix from your private key
- Ensure it's exactly 64 hexadecimal characters
- Verify you're using the Ed25519 private key, not the public key

### Position not rebalancing

- Check that `REBALANCE_THRESHOLD` is appropriate (0.05 = 5%)
- Verify the pool has enough liquidity
- Check logs for any errors during rebalance attempts
- Ensure your wallet has enough tokens for the new position

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

### Testing

The bot includes a comprehensive test suite with 79 tests achieving ~80% code coverage.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

For detailed testing documentation, see [TESTING.md](./TESTING.md).

#### Manual Testing

You can also run a manual test script to verify the bot functionality:

```bash
# Build first
npm run build

# Run manual test
node test-bot.js
```

### Code Structure

The bot follows a service-oriented architecture:

- **CetusSDKService**: Manages SDK initialization and wallet operations
- **PositionMonitorService**: Monitors positions and pool state
- **RebalanceService**: Handles rebalancing logic and execution
- **CetusRebalanceBot**: Orchestrates all services and manages the bot lifecycle

## Advanced Configuration

### Custom Range Calculation

By default, the bot calculates optimal ranges based on:
- Current tick index
- Pool tick spacing
- Configured range width

You can override this by setting `LOWER_TICK` and `UPPER_TICK` manually.

### Multiple Pools

To manage multiple pools, run multiple instances of the bot with different `.env` files:

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