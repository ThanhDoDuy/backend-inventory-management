import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RedisService } from '../infrastructure/redis/redis.service';
import { SeedDemoDataService } from './seed-demo-data.service';

process.env.SEED_DEMO = 'true';

async function assertRedisAvailable(redis: RedisService): Promise<void> {
  try {
    await redis.ping();
  } catch {
    console.error(`
Demo seed requires a reachable Redis instance (PO/inventory locks).

Your REDIS_URL could not be connected. For local development:

  REDIS_URL=redis://127.0.0.1:6379

Start Redis, then re-run:

  brew services start redis
  # or: docker run -d --name poos-redis -p 6379:6379 redis:7-alpine

If using Upstash, verify the hostname in REDIS_URL is still valid in the Upstash dashboard.
`);
    process.exit(1);
  }
}

function parseArgs(): { reset: boolean } {
  return { reset: process.argv.includes('--reset') };
}

function printResult(result: Awaited<ReturnType<SeedDemoDataService['run']>>) {
  console.log('\n========================================');
  console.log('  POOS Demo Data Seed');
  console.log('========================================\n');

  if (result.skipped) {
    console.log('Demo data already exists. Use --reset to re-seed.\n');
  } else {
    console.log(`Tenant: ${result.tenantName} (${result.tenantId})\n`);
    console.log('Summary:');
    console.log(`  Categories:      ${result.summary.categories}`);
    console.log(`  Products:        ${result.summary.products}`);
    console.log(`  Suppliers:       ${result.summary.suppliers}`);
    console.log(`  Customers:       ${result.summary.customers}`);
    console.log(`  Extra users:     ${result.summary.users - 1}`);
    console.log(`  Purchase orders: ${result.summary.purchaseOrders}`);
    console.log(`  Invoices:        ${result.summary.invoices}`);
    console.log(`  Adjustments:     ${result.summary.adjustments}`);
    console.log('');
  }

  console.log('Login credentials:\n');
  for (const account of result.accounts) {
    console.log(`  [${account.role}]`);
    console.log(`    Email:    ${account.email}`);
    console.log(`    Password: ${account.password}`);
    console.log('');
  }

  console.log('Frontend: http://localhost:3001/login');
  console.log('API:      http://localhost:8000/api/v1');
  console.log('\nDemo highlights:');
  console.log('  - Search "m" or "mat" → finds "Mặt nạ dưỡng ẩm"');
  console.log('  - Low stock: Mặt nạ (minimum 20, received 8, sold 3, adjusted -1)');
  console.log('  - PO states: RECEIVED, PARTIAL_RECEIVED, DRAFT');
  console.log('  - Customers: COMPANY, GROUP');
  console.log('========================================\n');
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await assertRedisAvailable(app.get(RedisService));

    const seeder = app.get(SeedDemoDataService);
    const result = await seeder.run(parseArgs());
    printResult(result);
  } finally {
    await app.close().catch(() => undefined);
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exit(1);
  });
