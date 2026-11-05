// cPanel/Passenger loads a CommonJS entry point; the application uses ESM.
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
process.chdir(__dirname);
// Prefer cPanel environment variables. A private .env is optional.
try { process.loadEnvFile(join(__dirname, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
import(pathToFileURL(join(__dirname, 'server.js')).href).catch(error => {
  console.error('PU Bingo startup failed:', error.message);
  process.exitCode = 1;
});
