const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require('jsonwebtoken');
require("dotenv").config();
const stripe = require("stripe")(process.env.Payment_key)
const port = process.env.PORT || 4000;

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@asif.yiiocqj.mongodb.net/?retryWrites=true&w=majority`;

// middleware
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const verifyUser = (req, res, next) =>{
  const authorization = req.headers.authorization;
  if (!authorization) {
  return  res.status(401).send({error: true, message: 'unauthorized Access' })
  }
  const token = authorization.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({error: true, message: 'unauthorized access'})
    }
    req.decoded = decoded;
    next()
  })
}


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    const usersCollection = client.db("sportsFeverdB").collection("users")
    const classesCollection = client.db("sportsFeverdB").collection("classes");
    const enrolledClassesCollection = client.db("sportsFeverdB").collection("selectedClasses")
    const paymentCollection = client.db("sportsFeverdB").collection("payment")


    app.post('/jwt', (req, res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1d'});
      res.send({token});
    })
 
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden Access' });
      }
      next();
    }
 
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden Access' });
      }
      next();
    }
 
  app.post('/users', async(req,res)=> {
    const userInfo = req.body;
   const query = {email: userInfo.email};
   const existing = await usersCollection.findOne(query);
   if (existing) {
    return res.send({message: "user exist"})
   }
    const result = await usersCollection.insertOne(userInfo);
    res.send(result)
})


  app.get('/users',verifyUser,verifyAdmin,  async(req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
  })


  app.get('/user/role/:email', async(req,res) => {
      const email = req.params.email;
      const query = {email: email};
      const result = await usersCollection.findOne(query);
      res.send(result)
  })


  app.patch("/user/admin/:id", async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateRole = {
          $set: {
              role: 'admin'
          },
      }
      const result = await usersCollection.updateOne(filter, updateRole);
      res.send(result)
  })

  app.patch("/user/instructor/:id", async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateRole = {
          $set: {
              role: 'instructor'
          },
      }
      const result = await usersCollection.updateOne(filter, updateRole);
      res.send(result)
  })

  app.delete("/user/delete/:id", async(req,res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(filter);
      res.send(result)
  })


  app.get("/classes", async(req, res) => {
      const result = (await classesCollection.find().toArray());
      const reversedResult = result.reverse();
      res.send(reversedResult);
  })

  app.get('/class/:id', async(req, res) => {
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await classesCollection.findOne(query);
    res.send(result)
  })

  app.get("/popular-class", async(req, res)=> {
      const query = {status: "approved"}
      const result = await classesCollection.find(query).sort({ bookedSeats: -1 }).limit(6).toArray();
      res.send(result)
  })
  
  app.get("/popular-instructor", async(req, res)=> {
    const topClasses = await classesCollection.find().sort({ bookedSeats: -1 }).toArray();
    const topInstructor = topClasses.map(rs => rs.instructorEmail)
    const filterEmail = [...new  Set(topInstructor)]
    const query = {email: {$in: filterEmail.map(email => email)}}
    const result = await usersCollection.find(query).limit(6).toArray();
    res.send(result)
})

app.get('/instructors', async(req, res)=> {
  const query = {role: 'instructor'}
  const result = await usersCollection.find(query).toArray();
  res.send(result)
})

  app.post('/add-class',verifyUser, verifyInstructor, async(req, res)=> {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass)
      res.send(result)
  })

  app.put('/update-class/:id', async(req, res) => {
    const id = req.params.id;
    const classData = req.body;
    const query = {_id: new ObjectId(id)};
    const updateClass = {$set: {
      className: classData.className,
      classImage: classData.classImage,
      seats: classData.seats,
      price: classData.price,
      classDetails: classData.classDetails,
      status : "pending"
    }}
    const result = await classesCollection.updateOne(query, updateClass);
    res.send(result)
    
  })
 
  app.get('/instructor/my-class',verifyUser, verifyInstructor, async(req, res) => {
    const email = req.query.email;
    const query = {instructorEmail: email}
    const result = await classesCollection.find(query).toArray();
    const reversedResult = result.reverse();
    res.send(reversedResult);
  })
  
  app.get('/my-enrolled-class',verifyUser, async(req, res)=> {
      const email = req.query.email;
      const query = {email: email}
      const result = await enrolledClassesCollection.find(query).toArray()
      res.send(result)
      
  })

  app.put('/update-status/:id', verifyUser, verifyAdmin, async(req,res)=> {
      const id = req.params.id;
      const {status} = req.body;
      const query = {_id: new ObjectId(id)};
      const updateStatus = {$set: {status: status}};
      const result = await classesCollection.updateOne(query, updateStatus);
      res.send(result)

  })
  
   app.put('/sent-feedback/:id',verifyUser, verifyAdmin, async(req, res) => {
    const id = req.params.id;
    const {feedback} = req.body;
    let saveFeedback = [];
    const query = {_id: new ObjectId(id)}
    const checkFeedback = await classesCollection.findOne(query);
    const existingFeedback = checkFeedback.feedback;
    saveFeedback = existingFeedback? [...existingFeedback, feedback] : [feedback];
    const options = { upsert: true };
    const updateFeedback = {$set: {feedback: saveFeedback}}
    const result = await classesCollection.updateOne(query, updateFeedback, options)
        res.send(result)
  })

  app.delete('/delete-selected-class/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await enrolledClassesCollection.deleteOne(query);
      res.send(result);

  })


  app.post('/select-class', verifyUser, async (req, res) => {
      const enrollInfo = req.body;
      const classId = enrollInfo.classId
      const studentEmail = enrollInfo.email
      const filterSelect = {classId: classId, email:studentEmail}
      const filterClass = {_id: new ObjectId(classId)}
      const checkExisting = await enrolledClassesCollection.findOne(filterSelect);
      const checkExistingPayment = await paymentCollection.findOne(filterSelect);
      const CheckSeats = await classesCollection.findOne(filterClass);
      if (checkExisting){
        return res.send({message: "You have already selected the class"})
      }
      else if (checkExistingPayment) {
             return res.send({message: "You have already enrolled the class"})
      } else if (CheckSeats.seats === CheckSeats.bookedSeats) {
        return res.send({message: "Our all seats is booked"})
      } else {
        const result = await enrolledClassesCollection.insertOne(enrollInfo);
          res.send(result)
      }
      
  })

  app.put("/booked-seat/:id", async(req, res) => {
    const id = req.params.id
    const query = {_id: new ObjectId(id)}
    const filter = await classesCollection.findOne(query)
    const options = { upsert: true };
    if (filter){
        const seats = filter.bookedSeats + 1 || 1;
        const update = { $set: { bookedSeats: seats } };
        const result = await classesCollection.updateOne(query, update, options)
        res.send(result)
    }
  })
  app.get('/my-enrolled', verifyUser, async(req, res)=> {
    const email = req.query.email;
    const query = {email: email};
    const result = await paymentCollection.find(query).toArray();
    res.send(result)
   
  })

  app.post('/create-payment-intent',verifyUser, async(req, res)=> {
    const {price} = req.body;
    const amount = parseInt(price*100);
    const paymentIntent= await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      payment_method_types: ["card"]
    })
    res.send({
      clientSecret: paymentIntent.client_secret,
    })
  })

  app.post('/payment', verifyUser, async(req, res)=>{
    const paymentInfo = req.body;
    const filterSelect = {classId: paymentInfo.classId, email:paymentInfo.email}
      const checkExisting = await paymentCollection.findOne(filterSelect);
      if (checkExisting){
        return res.send({message: "You have already enroll the class"})
      }
    const result = await paymentCollection.insertOne(paymentInfo)
    res.send(result)

  })

  app.get('/payment-history',verifyUser, async(req, res)=> {
    const email = req.query.email;
    const query = {email: email};
    const result = (await paymentCollection.find(query).toArray());
      const reversedResult = result.reverse();
      res.send(reversedResult);
  })





    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("SportsFever is running");
});

app.listen(port, () => {
  console.log(`SportsFever is running on port ${port}`);
});
