# Test Documentation

## Overview

This document describes the comprehensive test suite for the Cetus Liquidity Rebalance Bot.

## Test Coverage

The test suite achieves approximately **80% code coverage** across all modules:

- **Configuration Module**: 100% coverage
- **SDK Service**: 90.9% coverage
- **Monitor Service**: 78.18% coverage
- **Rebalance Service**: 86.66% coverage
- **Bot Main Class**: 84.09% coverage

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory. Open `coverage/lcov-report/index.html` in a browser to view detailed coverage information.

## Test Structure

### Configuration Tests (`src/__tests__/config.test.ts`)

Tests the configuration loading and validation:
- ✅ Loading configuration from environment variables
- ✅ Default values for optional settings
- ✅ Error handling for missing required variables
- ✅ Invalid network value validation
- ✅ Numeric value parsing
- ✅ Boolean value parsing
- ✅ Token amount handling
- ✅ Custom RPC URL configuration

**Total: 11 tests**

### SDK Service Tests (`src/__tests__/sdk.test.ts`)

Tests the Cetus SDK service initialization and wallet operations:
- ✅ Constructor initialization with valid config
- ✅ Private key handling (with and without 0x prefix)
- ✅ Invalid private key error handling
- ✅ Sui address generation
- ✅ Address consistency
- ✅ SuiClient initialization
- ✅ Keypair management
- ✅ SDK instance retrieval
- ✅ Balance queries
- ✅ Network configuration (mainnet/testnet)
- ✅ Custom RPC URL support

**Total: 17 tests**

### Position Monitor Service Tests (`src/__tests__/monitor.test.ts`)

Tests position monitoring and range calculation logic:
- ✅ Service initialization
- ✅ Position in-range detection (multiple scenarios)
- ✅ Rebalance threshold logic
- ✅ Distance to boundaries calculation
- ✅ Optimal range calculation
- ✅ Tick spacing alignment
- ✅ Negative and positive tick handling
- ✅ Custom range width configuration
- ✅ Pool info retrieval
- ✅ Edge cases (zero spacing, large values)

**Total: 20 tests**

### Rebalance Service Tests (`src/__tests__/rebalance.test.ts`)

Tests the rebalancing logic and execution:
- ✅ Service initialization
- ✅ Check and rebalance flow
- ✅ No rebalance needed scenario
- ✅ Rebalance needed scenario
- ✅ Error handling for network issues
- ✅ Pool with no existing positions
- ✅ Configured tick range usage
- ✅ Existing position rebalancing
- ✅ Range unchanged skip logic
- ✅ Error handling for pool/position operations
- ✅ Integration with real services

**Total: 13 tests**

### Bot Main Class Tests (`src/__tests__/bot.test.ts`)

Tests the main bot orchestration and lifecycle:
- ✅ Bot initialization
- ✅ Status reporting
- ✅ Start/stop lifecycle
- ✅ Multiple start/stop calls handling
- ✅ Running state management
- ✅ Configuration variations (mainnet, intervals, thresholds)
- ✅ Error handling for invalid configuration
- ✅ Full lifecycle with short intervals
- ✅ Multiple bot instances
- ✅ Address consistency across instances

**Total: 18 tests**

## Test Environment

### Test Configuration

Tests use a test environment configuration defined in `.env.test`:
- Network: testnet
- Private Key: Test key (0000...0001)
- Pool Address: Test address
- Various test parameters

### Mock Data

Tests use mock configurations and don't require actual blockchain connections, making them fast and reliable.

## Key Testing Patterns

### 1. Unit Testing
Each service is tested in isolation with mocked dependencies where needed.

### 2. Integration Testing
Some tests verify that services work together correctly (e.g., bot with all services).

### 3. Error Handling
Comprehensive error scenario testing ensures robustness.

### 4. Edge Cases
Tests cover edge cases like:
- Zero values
- Negative values
- Very large values
- Invalid inputs
- Missing data

### 5. State Management
Lifecycle tests ensure proper state transitions in the bot.

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:
- Fast execution (~15 seconds)
- No external dependencies required
- Deterministic results
- Clear error messages

## Future Improvements

Potential areas for additional testing:
1. End-to-end tests with test network
2. Performance/load testing
3. Transaction simulation tests
4. More comprehensive SDK integration tests (when SDK is fully configured)

## Test Results Summary

```
Test Suites: 5 passed, 5 total
Tests:       79 passed, 79 total
Snapshots:   0 total
Time:        ~15s
```

## Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure tests pass locally before committing
3. Maintain or improve coverage (aim for >80%)
4. Update this documentation for major changes
