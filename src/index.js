import { createApp } from './app.js';
import { ENV } from './config/env.js';

async function bootstrap() {
  const app = await createApp();
  app.listen(ENV.PORT, () => {
    console.log(`=======================================================`);
    console.log(`  REKART BACKEND SERVICE STARTED                      `);
    console.log(`  Port: ${ENV.PORT}                                   `);
    console.log(`  Environment: ${ENV.NODE_ENV}                        `);
    console.log(`  Pilot City: ${ENV.DEFAULT_CITY} (Nagpur)            `);
    console.log(`  Health Check: http://localhost:${ENV.PORT}/health   `);
    console.log(`=======================================================`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
