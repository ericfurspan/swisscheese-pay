import { createApp } from './app.js'
import { getDb } from './db/connection.js'
import { resetSchema } from './db/schema.js'
import { seed } from './db/seed.js'

const PORT = 8082
const HOST = '127.0.0.1'

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
