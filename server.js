const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
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
    const db = client.db('homeheroDB')
    const servicesCollection = db.collection('services')
    const bookingsCollection = db.collection('bookings')
    const usersCollection = db.collection('users')

    await servicesCollection.createIndex({ rating: -1 })
    await servicesCollection.createIndex({ hourly_rate: -1 })

    app.get('/', (req, res) => {
      res.send('HomeHero Server is running...')
    })

    app.post('/users/sync', async (req, res) => {
      try {
        const { uid, email, name, photoURL, providerIds, lastLoginAt } =
          req.body || {}
        if (!uid || !email)
          return res.status(400).json({ error: 'uid and email are required' })
        const update = {
          email,
          name: name || null,
          photoURL: photoURL || null,
          providerIds: Array.isArray(providerIds) ? providerIds : [],
          lastLoginAt: lastLoginAt ? new Date(Number(lastLoginAt)) : new Date(),
          updatedAt: new Date(),
        }
        await usersCollection.updateOne(
          { uid },
          { $setOnInsert: { createdAt: new Date(), uid }, $set: update },
          { upsert: true }
        )
        const doc = await usersCollection.findOne({ uid })
        res.status(200).json(doc)
      } catch {
        res.status(500).json({ error: 'Failed to sync user' })
      }
    })

    app.get('/users/:uid', async (req, res) => {
      try {
        const { uid } = req.params
        const doc = await usersCollection.findOne({ uid })
        if (!doc) return res.status(404).json({ error: 'User not found' })
        res.status(200).json(doc)
      } catch {
        res.status(500).json({ error: 'Failed to fetch user' })
      }
    })

    app.patch('/users/:uid', async (req, res) => {
      try {
        const { uid } = req.params
        const { name, photoURL, email, phone } = req.body || {}
        const set = { updatedAt: new Date() }
        if (name !== undefined) set.name = name
        if (photoURL !== undefined) set.photoURL = photoURL
        if (email !== undefined) set.email = email
        if (phone !== undefined) set.phone = phone
        const result = await usersCollection.updateOne({ uid }, { $set: set })
        if (!result.matchedCount)
          return res.status(404).json({ error: 'User not found' })
        res.status(200).json({ ok: true })
      } catch {
        res.status(500).json({ error: 'Failed to update user' })
      }
    })

    app.get('/services', async (req, res) => {
      try {
        const { search, sort, category, minPrice, maxPrice } = req.query
        const query = {}
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
          ]
        }
        if (category) query.category = category
        if (minPrice || maxPrice) {
          const gte = minPrice ? Number(minPrice) : undefined
          const lte = maxPrice ? Number(maxPrice) : undefined
          query.hourly_rate = {}
          if (!Number.isNaN(gte)) query.hourly_rate.$gte = gte
          if (!Number.isNaN(lte)) query.hourly_rate.$lte = lte
          if (Object.keys(query.hourly_rate).length === 0)
            delete query.hourly_rate
        }
        let cursor = servicesCollection.find(query)
        if (sort) {
          const key = sort.toLowerCase() === 'price' ? 'hourly_rate' : 'rating'
          cursor = cursor.sort({ [key]: -1 })
        }
        const services = await cursor.toArray()
        res.status(200).json(services)
      } catch {
        res.status(500).json({ error: 'Failed to fetch services' })
      }
    })

    app.get('/services/:id', async (req, res) => {
      try {
        const { id } = req.params
        let doc = null
        if (ObjectId.isValid(id))
          doc = await servicesCollection.findOne({ _id: new ObjectId(id) })
        if (!doc) doc = await servicesCollection.findOne({ id })
        if (!doc) return res.status(404).json({ error: 'Service not found' })
        res.status(200).json(doc)
      } catch {
        res.status(400).json({ error: 'Invalid id' })
      }
    })

    app.post('/services', async (req, res) => {
      try {
        const s = req.body
        const { title, category, hourly_rate, uid, providerEmail } = s
        if (!title || !category || hourly_rate === undefined)
          return res
            .status(400)
            .json({ error: 'title, category, hourly_rate are required.' })
        if (typeof hourly_rate !== 'number')
          return res
            .status(400)
            .json({ error: 'hourly_rate must be a number.' })
        const doc = {
          ...s,
          uid: uid || null,
          providerEmail: providerEmail || null,
          createdAt: new Date(),
        }
        const result = await servicesCollection.insertOne(doc)
        res.status(201).json({ ...doc, _id: result.insertedId })
      } catch {
        res.status(500).json({ error: 'Failed to add service.' })
      }
    })

    app.patch('/services/:id', async (req, res) => {
      try {
        const { id } = req.params
        const { uid, userEmail } = req.body || {}
        let svc = null
        let filter = null
        if (ObjectId.isValid(id)) {
          svc = await servicesCollection.findOne({ _id: new ObjectId(id) })
          filter = { _id: new ObjectId(id) }
        }
        if (!svc) {
          svc = await servicesCollection.findOne({ id })
          filter = { id }
        }
        if (!svc) return res.status(404).json({ error: 'Service not found' })

        let ownerOk = true
        if (svc.uid) ownerOk = uid && String(uid) === String(svc.uid)
        if (!svc.uid && svc.providerEmail)
          ownerOk =
            userEmail &&
            String(userEmail).toLowerCase() ===
              String(svc.providerEmail).toLowerCase()
        if (!ownerOk) return res.status(403).json({ error: 'Not allowed' })

        const body = req.body || {}
        const up = {}
        if (Object.prototype.hasOwnProperty.call(body, 'title'))
          up.title = body.title
        if (Object.prototype.hasOwnProperty.call(body, 'category'))
          up.category = body.category
        if (Object.prototype.hasOwnProperty.call(body, 'hourly_rate')) {
          if (typeof body.hourly_rate !== 'number')
            return res
              .status(400)
              .json({ error: 'hourly_rate must be a number' })
          up.hourly_rate = body.hourly_rate
        }
        if (Object.prototype.hasOwnProperty.call(body, 'description'))
          up.description = body.description
        if (Object.prototype.hasOwnProperty.call(body, 'image'))
          up.image = body.image
        if (Object.prototype.hasOwnProperty.call(body, 'duration'))
          up.duration = body.duration
        if (Object.prototype.hasOwnProperty.call(body, 'location'))
          up.location = body.location
        if (Object.prototype.hasOwnProperty.call(body, 'featured'))
          up.featured = !!body.featured

        if (!Object.keys(up).length)
          return res.status(400).json({ error: 'No editable fields provided' })

        await servicesCollection.updateOne(filter, {
          $set: { ...up, updatedAt: new Date() },
        })
        const updated = await servicesCollection.findOne(filter)
        res.status(200).json(updated)
      } catch {
        res.status(500).json({ error: 'Failed to update service' })
      }
    })

    app.delete('/services/:id', async (req, res) => {
      try {
        const { id } = req.params
        const q = req.query || {}
        const b = req.body || {}
        const uid = q.uid || b.uid || null
        const userEmail = q.userEmail || b.userEmail || null

        let svc = null
        let filter = null
        if (ObjectId.isValid(id)) {
          svc = await servicesCollection.findOne({ _id: new ObjectId(id) })
          filter = { _id: new ObjectId(id) }
        }
        if (!svc) {
          svc = await servicesCollection.findOne({ id })
          filter = { id }
        }
        if (!svc) return res.status(404).json({ error: 'Service not found' })

        let ownerOk = true
        if (svc.uid) ownerOk = uid && String(uid) === String(svc.uid)
        if (!svc.uid && svc.providerEmail)
          ownerOk =
            userEmail &&
            String(userEmail).toLowerCase() ===
              String(svc.providerEmail).toLowerCase()
        if (!ownerOk) return res.status(403).json({ error: 'Not allowed' })

        const result = await servicesCollection.deleteOne(filter)
        if (!result.deletedCount)
          return res.status(404).json({ error: 'Service not found' })
        res.status(200).json({ ok: true })
      } catch {
        res.status(500).json({ error: 'Failed to delete service' })
      }
    })

    app.post('/bookings', async (req, res) => {
      try {
        const b = req.body
        const { serviceId, userEmail, bookingDate } = b
        if (!serviceId || !userEmail || !bookingDate)
          return res
            .status(400)
            .json({ error: 'serviceId, userEmail, bookingDate are required.' })

        let svc = null
        if (ObjectId.isValid(serviceId))
          svc = await servicesCollection.findOne({
            _id: new ObjectId(serviceId),
          })
        if (!svc) svc = await servicesCollection.findOne({ id: serviceId })
        if (!svc) return res.status(404).json({ error: 'Service not found' })

        if (svc.uid && b.uid && String(svc.uid) === String(b.uid))
          return res
            .status(403)
            .json({ error: 'You cannot book your own service' })
        if (
          svc.providerEmail &&
          String(svc.providerEmail).toLowerCase() ===
            String(userEmail).toLowerCase()
        )
          return res
            .status(403)
            .json({ error: 'You cannot book your own service' })

        const doc = {
          serviceId,
          uid: b.uid || null,
          userEmail,
          title: b.title || svc.title,
          category: b.category || svc.category,
          hourly_rate:
            typeof b.hourly_rate === 'number' ? b.hourly_rate : svc.hourly_rate,
          price: typeof b.price === 'number' ? b.price : svc.hourly_rate,
          duration: b.duration || svc.duration || '',
          location: b.location || svc.location || '',
          image: b.image || svc.image || '',
          bookingDate: new Date(bookingDate),
          status: 'ongoing',
          createdAt: new Date(),
        }
        const result = await bookingsCollection.insertOne(doc)
        res.status(201).json({ ...doc, _id: result.insertedId })
      } catch {
        res.status(500).json({ error: 'Failed to create booking.' })
      }
    })

    app.get('/bookings', async (req, res) => {
      try {
        const { uid, userEmail } = req.query
        if (!uid && !userEmail)
          return res.status(400).json({ error: 'uid or userEmail is required' })
        const query = uid ? { uid } : { userEmail }
        const items = await bookingsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray()
        res.status(200).json(items)
      } catch {
        res.status(500).json({ error: 'Failed to fetch bookings.' })
      }
    })

    app.patch('/bookings/:id', async (req, res) => {
      try {
        const { id } = req.params
        const { status } = req.body
        if (!status)
          return res.status(400).json({ error: 'status is required' })
        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        )
        if (result.matchedCount === 0)
          return res.status(404).json({ error: 'Booking not found' })
        res.status(200).json({ ok: true })
      } catch {
        res.status(500).json({ error: 'Failed to update booking.' })
      }
    })

    app.delete('/bookings/:id', async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: 'Invalid id' })
        const result = await bookingsCollection.deleteOne({
          _id: new ObjectId(id),
        })
        if (result.deletedCount === 0)
          return res.status(404).json({ error: 'Booking not found' })
        res.status(200).json({ ok: true })
      } catch {
        res.status(500).json({ error: 'Failed to delete booking.' })
      }
    })

    app.get('/my-services', async (req, res) => {
      try {
        const { uid } = req.query
        if (!uid) return res.status(400).json({ error: 'uid is required' })
        const my = await servicesCollection
          .find({ uid })
          .sort({ createdAt: -1 })
          .toArray()
        res.status(200).json(my)
      } catch {
        res.status(500).json({ error: 'Failed to fetch user services.' })
      }
    })

    app.listen(port, () => {
      console.log(`Server running on port ${port}`)
    })
  } catch (err) {
    console.error(err)
  }
}

run().catch(console.dir)
