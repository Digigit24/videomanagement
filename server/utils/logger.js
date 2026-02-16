import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '../logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function getTimestamp() {
  return new Date().toISOString();
}

function writeToFile(filename, message) {
  const logFile = path.join(logsDir, filename);
  const logMessage = `[${getTimestamp()}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
}

export function log(message, data = null) {
  const timestamp = getTimestamp();
  const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
  console.log(`[${timestamp}] ${fullMessage}`);
  writeToFile('app.log', fullMessage);
}

export function error(message, err = null) {
  const timestamp = getTimestamp();
  const errorDetails = err ? `${message}\n${err.stack || err}` : message;
  console.error(`[${timestamp}] ERROR: ${errorDetails}`);
  writeToFile('error.log', `ERROR: ${errorDetails}`);
}

export function apiError(req, err) {
  const errorLog = {
    timestamp: getTimestamp(),
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack
  };
  console.error('API Error:', errorLog);
  writeToFile('api-errors.log', JSON.stringify(errorLog, null, 2));
}

export function logRequest(req) {
  const requestLog = {
    timestamp: getTimestamp(),
    method: req.method,
    url: req.url,
    headers: req.headers
  };
  writeToFile('requests.log', JSON.stringify(requestLog));
}
