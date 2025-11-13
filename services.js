const { MongoClient, ServerApiVersion } = require('mongodb')
require('dotenv').config()
const servicesData = require('./servicesData.json') // Make sure this file exists

const uri = process.env.MONGO_URI
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function services() {
  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('homeheroDB')
    const servicesCollection = db.collection('services')

    await servicesCollection.deleteMany({})
    console.log('Cleared old services')

    const result = await servicesCollection.insertMany(servicesData)
    console.log(`Inserted ${result.insertedCount} services`)
  } catch (err) {
    console.error(err)
  } finally {
    await client.close()
    console.log('🔒 Connection closed')
  }
}

services()
