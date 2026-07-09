#!/bin/sh
set -e

# Generate a fresh secret per container boot when none is supplied, rather
# than shipping a fixed one in docker-compose.yml -- a secret committed to a
# portfolio repo that will eventually go public is exactly the "weak/
# guessable signing secret" vulnerability this baseline is supposed to be
# free of (see server/src/auth/token.ts). Sessions don't need to survive a
# restart: the DB reseeds on every boot anyway.
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
fi

exec node server/dist/index.js
