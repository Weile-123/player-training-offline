import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
const directory = resolve('activity/cloudfunctions/activity_api'), port = 19483;
const {applicationId} = JSON.parse(await readFile(resolve(directory, 'project.json'), 'utf8'));
const startupTimeoutMs = 30_000, started = performance.now();
const child = spawn(process.execPath, ['index.cjs'], {
 cwd: directory,
 env: {...process.env, BUSINESS_ACTIVITY_ID: applicationId, CLOUDBASE_ENV_ID: 'local-contract-test', COLORBOX__ACCESS_KEY: 'local-not-a-real-credential', PORT: String(port)},
 stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '', stopped = false, startupError;
const collect = chunk => {output = (output + chunk.toString()).slice(-8192);};
child.stdout.on('data', collect); child.stderr.on('data', collect);
const closed = new Promise(resolve => {
 child.once('error', error => {startupError = error; stopped = true; resolve();});
 child.once('exit', () => {stopped = true; resolve();});
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function diagnostics(message, cause) {
 return Error(`${message}; elapsed=${Math.round(performance.now() - started)}ms, port=${port}, pid=${child.pid ?? 'not-started'}, exitCode=${child.exitCode}, signal=${child.signalCode}${cause ? `; last request: ${cause.code ? `${cause.code}: ` : ''}${cause.message}` : ''}${output ? `\nChild output:\n${output.trim()}` : '; child output: (empty)'}`);
}
function request(path, method = 'GET', body, timeoutMs = 2000) {
 return new Promise((resolve, reject) => {
  let settled = false, timer;
  const finish = (error, value) => {
   if (settled) return;
   settled = true; clearTimeout(timer);
   if (error) reject(error); else resolve(value);
  };
  const req = http.request({hostname: '127.0.0.1', port, path, method, headers: {'Content-Type': 'application/json'}}, res => {
   let text = '';
   res.on('data', chunk => {text += chunk; if (Buffer.byteLength(text) > 16384) req.destroy(Error(`${method} ${path}: response exceeds 16 KiB`));});
   res.on('error', error => finish(error));
   res.on('end', () => {
    try {finish(null, {status: res.statusCode, body: JSON.parse(text)});}
    catch {finish(Error(`${method} ${path}: invalid JSON (HTTP ${res.statusCode}), body=${JSON.stringify(text.slice(0, 200))}`));}
   });
  });
  req.on('error', error => finish(error));
  // A stalled connection must not consume the entire startup deadline.
  timer = setTimeout(() => req.destroy(Object.assign(Error(`${method} ${path} timed out after ${timeoutMs}ms`), {code: 'ETIMEDOUT'})), timeoutMs);
  if (body) req.write(JSON.stringify(body));
  req.end();
 });
}
try{
 let health, lastError, attempts = 0;
 const deadline = started + startupTimeoutMs;
 while (performance.now() < deadline) {
  if (stopped) throw diagnostics('Local function stopped before readiness', startupError ?? lastError);
  attempts++;
  try {health = await request('/api/health', 'GET', undefined, Math.min(1000, Math.max(1, deadline - performance.now()))); break;}
  catch (error) {
   lastError = error;
   if (['EACCES', 'EPERM'].includes(error.code)) throw diagnostics('Local loopback access was denied by the execution environment; rerun this local smoke test with the required sandbox permission', error);
   if (!['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(error.code)) throw diagnostics('Local readiness request failed', error);
  }
  const remaining = deadline - performance.now();
  if (remaining > 0) await Promise.race([delay(Math.min(100, remaining)), closed]);
 }
 if (!health) throw diagnostics(`Local function did not become ready within ${startupTimeoutMs}ms (${attempts} attempts)`, lastError);
 if (health.status !== 200 || health.body?.data?.applicationId !== applicationId) throw diagnostics(`Invalid local health response: ${JSON.stringify(health)}`);
 if (stopped) throw diagnostics('Local function exited during readiness check', startupError);
 const startupMs = Math.round(performance.now() - started);
 const rejected=await request('/api/leaderboard/submit','POST',{event:'gym-progress',runId:'1800000000000-23',revision:0});
 if (rejected.status !== 401) throw diagnostics(`Unauthenticated local write was not rejected: ${JSON.stringify(rejected)}`);
 console.log(JSON.stringify({localHealth: true, unauthenticatedWriteRejected: true, applicationId, startupMs, attempts, cloudRequests: false}));
} finally {
 if (!stopped) {
  child.kill();
  await Promise.race([closed, delay(2000)]);
  if (!stopped) {child.kill('SIGKILL'); await Promise.race([closed, delay(2000)]);}
 }
}
