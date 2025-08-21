set -e
cd /directus
mkdir -p /directus/shared

#Strategy:
#other services are waiting for extensions to be safe, i.e. for the first build to be done, indicated with the presents of extensions_safe_notice.txt
#So we do a normal build, mark as afe, then start the watch process in the background


# Remove safety file if it exists
rm -f /directus/shared/extensions_safe_notice.txt

# First run a build to generate api.js files
echo "Building extensions before starting watch mode..."
find extensions -mindepth 1 -maxdepth 1 -type d -exec sh -c 'cd "$1" && npm install && npm install --dev && npx directus-extension build --no-minify' _ {} \;

# Signal that extensions are initially built and safe to use
echo "Extensions initially built and ready" > /directus/shared/extensions_safe_notice.txt
echo "Extensions are ready for initial use"

# Now start the watch process in the background
echo "Starting watch mode for continuous development..."
find extensions -mindepth 1 -maxdepth 1 -type d -exec sh -c 'cd "$1" && npm run dev &' _ {} \;

# Keep container running
tail -f /dev/null