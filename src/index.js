import { createApp } from './app.js';
import { ENV } from './config/env.js';

// Vercel imports this module and serves the default-exported Express app; it must not call listen().
const app = await createApp();
export default app;

if (!process.env.VERCEL) {
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
