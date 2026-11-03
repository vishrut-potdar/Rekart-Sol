import app from './app.js';
import { ENV } from './config/env.js';

// Local server only; on Vercel the default export of src/app.js is served directly.
app.listen(ENV.PORT, () => {
  console.log(`=======================================================`);
  console.log(`  REKART BACKEND SERVICE STARTED                      `);
  console.log(`  Port: ${ENV.PORT}                                   `);
  console.log(`  Environment: ${ENV.NODE_ENV}                        `);
  console.log(`  Pilot City: ${ENV.DEFAULT_CITY} (Nagpur)            `);
  console.log(`  Health Check: http://localhost:${ENV.PORT}/health   `);
  console.log(`=======================================================`);
});
