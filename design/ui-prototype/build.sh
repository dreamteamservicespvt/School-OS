#!/bin/sh
set -e
cd "$(dirname "$0")"
node gen-icons.js
npx esbuild src/main.jsx --bundle --minify --format=iife --target=es2019 \
  --alias:react=./shim/react.js --alias:react-dom=./shim/react-dom.js --alias:react/jsx-runtime=./shim/jsx-runtime.js \
  --jsx=transform --loader:.js=jsx --outfile=dist/app.js --log-level=warning
npx tailwindcss -i src/styles.css -o dist/app.css --minify 2>/dev/null
node assemble.js
