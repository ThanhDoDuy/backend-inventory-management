import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedTaxReportService } from './seed-tax-report.service';

process.env.SEED_DEMO = 'true';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    console.log('\n========================================');
    console.log('  POOS Tax Report (S1a-HKD) Seed');
    console.log('========================================\n');

    const seeder = app.get(SeedTaxReportService);
    await seeder.run();

    console.log('\nTax report seed complete.');
    console.log('Open: http://localhost:3001/dashboard/reports/tax/s1a-hkd');
    console.log('Year: 2025');
    console.log('========================================\n');
  } finally {
    await app.close().catch(() => undefined);
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Tax report seed failed:', error);
    process.exit(1);
  });
