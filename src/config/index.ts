import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Check if .env file exists, if not, create it from .env.example
const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    try {
      console.log('\n⚠️  No .env file found. Creating one from .env.example...');
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✅ .env file created. Please edit it with your configuration.');
      console.log('📝 Required settings: PRIVATE_KEY, POOL_ADDRESS, POSITION_ID, TOKEN_A_AMOUNT, TOKEN_B_AMOUNT');
      console.log('⚠️  The application will not work until you configure these values.\n');
    } catch (error) {
      console.error('\n❌ Error: Failed to create .env file!');
      console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Please check file permissions and try creating the file manually.\n');
      process.exit(1);
    }
  } else {
    console.error('\n❌ Error: Neither .env nor .env.example file found!');
    console.error('Please make sure you are running this from the project root directory.\n');
    process.exit(1);
  }
}

dotenv.config();

export interface BotConfig {
  // Network configuration
  network: 'mainnet' | 'testnet';
  suiRpcUrl?: string;
  privateKey: string;

  // Bot settings
  checkInterval: number; // seconds
  rebalanceThreshold: number; // percentage as decimal (e.g., 0.05 = 5%)

  // Pool settings
  poolAddress: string;
  positionId?: string;
  lowerTick?: number;
  upperTick?: number;
  rangeWidth?: number;

  // Token amounts
  tokenAAmount?: string;
  tokenBAmount?: string;

  // Risk management
  maxSlippage: number;
  gasBudget: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  verboseLogs: boolean;
}

function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
}

export function loadConfig(): BotConfig {
  // Collect all missing required environment variables
  const missingVars: string[] = [];
  
  const network = getEnvVar('NETWORK', false) || 'mainnet';
  
  if (network !== 'mainnet' && network !== 'testnet') {
    throw new Error(`Invalid NETWORK value: ${network}. Must be 'mainnet' or 'testnet'`);
  }

  // Check all required variables without throwing immediately
  if (!process.env.PRIVATE_KEY) missingVars.push('PRIVATE_KEY');
  if (!process.env.POOL_ADDRESS) missingVars.push('POOL_ADDRESS');
  if (!process.env.POSITION_ID) missingVars.push('POSITION_ID');
  if (!process.env.TOKEN_A_AMOUNT) missingVars.push('TOKEN_A_AMOUNT');
  if (!process.env.TOKEN_B_AMOUNT) missingVars.push('TOKEN_B_AMOUNT');

  // If any required variables are missing, throw a comprehensive error
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Please create a .env file from .env.example and configure these variables.\n` +
      `See README.md for configuration instructions.`
    );
  }

  const privateKey = getEnvVar('PRIVATE_KEY');
  const poolAddress = getEnvVar('POOL_ADDRESS');

  return {
    network,
    suiRpcUrl: getEnvVar('SUI_RPC_URL', false) || undefined,
    privateKey,
    checkInterval: getEnvNumber('CHECK_INTERVAL', 300),
    rebalanceThreshold: getEnvNumber('REBALANCE_THRESHOLD', 0.05),
    poolAddress,
    positionId: getEnvVar('POSITION_ID', false) || undefined,
    lowerTick: getEnvVar('LOWER_TICK', false) ? parseInt(getEnvVar('LOWER_TICK', false)) : undefined,
    upperTick: getEnvVar('UPPER_TICK', false) ? parseInt(getEnvVar('UPPER_TICK', false)) : undefined,
    rangeWidth: getEnvVar('RANGE_WIDTH', false) ? parseInt(getEnvVar('RANGE_WIDTH', false)) : undefined,
    tokenAAmount: getEnvVar('TOKEN_A_AMOUNT', false) || undefined,
    tokenBAmount: getEnvVar('TOKEN_B_AMOUNT', false) || undefined,
    maxSlippage: getEnvNumber('MAX_SLIPPAGE', 0.01),
    gasBudget: getEnvNumber('GAS_BUDGET', 50000000),
    logLevel: (getEnvVar('LOG_LEVEL', false) || 'info') as 'debug' | 'info' | 'warn' | 'error',
    verboseLogs: getEnvBoolean('VERBOSE_LOGS', false),
  };
}

export const config = loadConfig();
