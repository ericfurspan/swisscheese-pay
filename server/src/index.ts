import { createApp } from './app.js'
import { getDb } from './db/connection.js'
import { resetSchema } from './db/schema.js'
import { seed } from './db/seed.js'

const PORT = 8082
// Bare-metal default stays loopback-only. Docker overrides this to 0.0.0.0
// because container port publishing forwards to the container's non-loopback
// interface -- binding 127.0.0.1 in that context would make the app
// unreachable even with a port mapping. The loopback-only guarantee is
// enforced instead by docker-compose's 127.0.0.1:8082:8082 host-side bind.
const HOST = process.env.HOST ?? '127.0.0.1'

// Reseeds on every boot, deliberately -- this is a training target meant to
// reset to a known state for repeatable scans, not a service with data to
// preserve across restarts.
const db = getDb()
resetSchema(db)
seed(db)

const app = createApp()
app.listen(PORT, HOST, () => {
  console.log(`SwissCheese Pay listening on http://${HOST}:${PORT}`)
})
