#!/usr/bin/env node
/**
 * mint-gh-token — mint a fresh GitHub App installation access token for
 * deploy-time npm installs of private agents-* libs.
 *
 * Reads three env vars (set on Vercel project):
 *   AH_APP_ID                — numeric App ID
 *   AH_APP_INSTALLATION_ID   — numeric installation ID
 *   AH_APP_PRIVATE_KEY       — full .pem contents (multi-line, includes
 *                              -----BEGIN/END PRIVATE KEY----- markers)
 *
 * Mints a `ghs_*` installation token (1h TTL) and prints ONLY the token to
 * stdout so the caller can capture it into a shell variable, e.g.
 *
 *   TOKEN=$(node scripts/mint-gh-token.cjs)
 *
 * Errors go to stderr and the process exits non-zero. The private key is
 * never echoed, logged, or written to disk.
 *
 * This script is invoked from scripts/vercel-install.sh BEFORE `npm install`
 * runs. The token is then used to rewrite `ssh://git@github.com/` → HTTPS
 * with x-access-token, matching the existing PAT flow.
 */

'use strict';

const https = require('https');

function fail(msg) {
  process.stderr.write(`[mint-gh-token] ${msg}\n`);
  process.exit(1);
}

function loadEnv() {
  const appId = process.env.AH_APP_ID;
  const instId = process.env.AH_APP_INSTALLATION_ID;
  // Prefer base64-encoded single-line form (works around Vercel CLI's
  // multi-line stdin truncation); fall back to raw multi-line PEM if set.
  const keyB64 = process.env.AH_APP_PRIVATE_KEY_B64;
  const keyRaw = process.env.AH_APP_PRIVATE_KEY;
  let key;
  if (keyB64) {
    try {
      key = Buffer.from(keyB64, 'base64').toString('utf8');
    } catch (e) {
      fail('AH_APP_PRIVATE_KEY_B64 is not valid base64');
    }
  } else if (keyRaw) {
    key = keyRaw;
  } else {
    fail(
      'missing env: AH_APP_PRIVATE_KEY_B64 (preferred) or AH_APP_PRIVATE_KEY required'
    );
  }
  if (!appId || !instId) {
    fail(
      'missing env: AH_APP_ID, AH_APP_INSTALLATION_ID required'
    );
  }
  if (!/^\d+$/.test(appId)) fail('AH_APP_ID must be numeric');
  if (!/^\d+$/.test(instId)) fail('AH_APP_INSTALLATION_ID must be numeric');
  if (!key.includes('PRIVATE KEY')) {
    fail('private key does not look like a PEM (missing PRIVATE KEY marker)');
  }
  return { appId, instId, key };
}

// Native RS256 JWT signing using Node's built-in crypto — no npm deps.
// Avoids the `npm install --no-save jsonwebtoken` step that hangs on Vercel
// build (silent 40+ second hang → exit 128).
const crypto = require('crypto');

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  // iat 60s in the past to tolerate clock skew; exp 9 minutes ahead (GitHub
  // caps JWT lifetime at 10 minutes).
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 540, iss: Number(appId) };
  const headerEncoded = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  let signature;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signature = signer.sign(privateKey);
  } catch (e) {
    fail(`RS256 sign failed: ${e.message}`);
  }
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function postAccessToken(instId, jwtToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.github.com',
        path: `/app/installations/${instId}/access_tokens`,
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ah-deploy-agents-mint/1.0',
          'Content-Length': '0',
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 201) {
            // Truncate body in case it ever contains anything sensitive.
            return reject(
              new Error(
                `github responded ${res.statusCode}: ${body.slice(0, 300)}`
              )
            );
          }
          try {
            const parsed = JSON.parse(body);
            if (!parsed.token) return reject(new Error('response missing token field'));
            resolve(parsed.token);
          } catch (e) {
            reject(new Error('invalid JSON from github'));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout contacting api.github.com'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const { appId, instId, key } = loadEnv();
  const jwtToken = signJwt(appId, key);
  const token = await postAccessToken(instId, jwtToken);
  // Print ONLY the token to stdout. No newline-padding, no JSON, no logs.
  process.stdout.write(token);
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
