import express from "express"
import cors from "cors"

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json())

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "The Back Room API",
    time: new Date().toISOString(),
  })
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`The Back Room API listening on port ${PORT}`)
})
