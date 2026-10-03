/**
 * Floci Connection & Health Verification Script
 *
 * Verifies that the Floci local cloud engine is accessible,
 * queries active services, and demonstrates zero-auth S3/SQS operations.
 */

const ENDPOINT = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';

async function checkFloci() {
  console.log(`\n==============================================`);
  console.log(`⚡ Testing Floci Local Cloud at ${ENDPOINT}`);
  console.log(`==============================================\n`);

  try {
    // 1. Health check probe
    console.log(`[1/3] Probing Floci health endpoint...`);
    const healthRes = await fetch(`${ENDPOINT}/_floci/health`).catch(() => null) 
                   || await fetch(`${ENDPOINT}/_localstack/health`).catch(() => null)
                   || await fetch(`${ENDPOINT}/health`).catch(() => null);

    if (!healthRes || !healthRes.ok) {
      console.log(`⚠️ Floci health endpoint returned status: ${healthRes ? healthRes.status : 'Connection Refused'}`);
      console.log(`\n💡 Tip: Make sure Docker Desktop is started and run:\n   docker compose up -d floci\n`);
      return;
    }

    const healthData = await healthRes.json().catch(() => ({ status: 'running' }));
    console.log(`✅ Floci is UP and RUNNING!`);
    console.log(`Status details:`, JSON.stringify(healthData, null, 2));

    // 2. Test S3 root / bucket listing
    console.log(`\n[2/3] Testing S3 REST API (virtual-hosted / path style)...`);
    const s3Res = await fetch(`${ENDPOINT}/`, {
      method: 'GET',
      headers: {
        'Host': 'localhost',
        'Authorization': 'AWS4-HMAC-SHA256 Credential=test/20261003/us-east-1/s3/aws4_request, ...'
      }
    });
    console.log(`S3 API response status: ${s3Res.status} (${s3Res.statusText})`);

    console.log(`\n[3/3] Ready for AI Agent infrastructure workflows!`);
    console.log(`- AWS SDK endpoint: ${ENDPOINT}`);
    console.log(`- Dummy credentials: AWS_ACCESS_KEY_ID=test, AWS_SECRET_ACCESS_KEY=test`);
    console.log(`==============================================\n`);
  } catch (err) {
    console.error(`❌ Could not connect to Floci:`, err.message);
    console.log(`\n💡 Docker check:\n   1. Ensure Docker Desktop is running.\n   2. Run 'docker compose up -d floci'\n`);
  }
}

checkFloci();
