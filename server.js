const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const uri = process.env.MONGO_URI
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    await client.connect()
    console.log(' MongoDB connected successfully')

    const db = client.db('homeheroDB')
    const servicesCollection = db.collection('services')

    app.get('/', (req, res) => {
      res.send('HomeHero Server is running...')
    })

    app.get('/services', async (req, res) => {
      try {
        const { search, sort } = req.query

        let query = {}

        if (search) {
          query = {
            $or: [
              { title: { $regex: search, $options: 'i' } },
              { category: { $regex: search, $options: 'i' } },
            ],
          }
        }

        let cursor = servicesCollection.find(query)

        if (sort) {
          let sortField = 'rating'
          if (sort.toLowerCase() === 'price') sortField = 'hourly_rate'
          cursor = cursor.sort({ [sortField]: -1 })
        }

        const services = await cursor.toArray()

        res.status(200).send(services)
      } catch (error) {
        console.error(error)
        res.status(500).send({ error: 'Failed to fetch services' })
      }
    })

    app.post('/services', async (req, res) => {
      try {
        const service = req.body

        if (!service.title || !service.category || !service.price) {
          return res
            .status(400)
            .send({ error: 'Title, category, and price are required.' })
        }

        const result = await servicesCollection.insertOne(service)
        res.status(201).send(result)
      } catch (error) {
        console.error(error)
        res.status(500).send({ error: 'Failed to add service.' })
      }
    })

    app.listen(port, () => {
      console.log(`Server running on port ${port}`)
    })
  } catch (error) {
    console.error(error)
  }
}

run().catch(console.dir)
