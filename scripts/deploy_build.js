const { execSync } = require('child_process');

console.log('[deploy_build] Starting production build process...');

function runCmd(cmd, allowFail = false) {
  try {
    console.log(`[deploy_build] Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (err) {
    if (allowFail) {
      console.warn(`[deploy_build] Non-fatal notice for: ${cmd}`);
      return false;
    }
    console.error(`[deploy_build] Command failed: ${cmd}`);
    process.exit(1);
  }
}

// 1. Generate Prisma Client
runCmd('node ./node_modules/prisma/build/index.js generate');

// 2. Safely resolve any previously failed migration state on production DB
runCmd('node ./node_modules/prisma/build/index.js migrate resolve --rolled-back 20261012144000_add_referral_and_coupon_system', true);

// 3. Deploy pending migrations
runCmd('node ./node_modules/prisma/build/index.js migrate deploy');

console.log('[deploy_build] Build and migrations completed successfully!');
