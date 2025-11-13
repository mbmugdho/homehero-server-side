const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {

    await client.connect();
    console.log(' MongoDB connected successfully');

    const db = client.db('homeheroDB');
    const servicesCollection = db.collection('services');

    app.get('/', (req, res) => {
      res.send('HomeHero Server is running...');
    });

    app.get('/services', async (req, res) => {
      const services = await servicesCollection.find().toArray();
      res.send(services);
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);
