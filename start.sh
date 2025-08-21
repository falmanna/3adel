
set -euo pipefail

echo bootstrapping
node cli.js bootstrap
echo "Importing latest schema"
node cli.js schema-sync import

pm2-runtime start ecosystem.config.cjs