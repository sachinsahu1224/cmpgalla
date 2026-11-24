import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web', 'dist')
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '0.0.0.0'
const app = express()

app.use(express.static(dist, { index: false }))
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  res.sendFile(path.join(dist, 'index.html'), (error) => {
    if (error) next(error)
  })
})

app.listen(port, host, () => {
  console.log(`CMP GallaBill http://${host}:${port}`)
})
