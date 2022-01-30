const express = require("express");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const SSLCommerzPayment = require("sslcommerz");
const { v4: uuidv4 } = require("uuid");

const app = express();
const cors = require("cors");
require("dotenv").config();
const fileUpload = require("express-fileupload");

const port = process.env.PORT || 5000;

app.use(cors());
app.use(fileUpload());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb" }));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qzrcz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
async function run() {
  try {
    await client.connect();
    const database = client.db("electroShop");
    const productCollection = database.collection("products");
    const userProfileDataCollection = database.collection("userprofile");
    const ordersCollection = database.collection("orders");
    const usersCollection = database.collection("users");

    app.post("/addproduct", async (req, res) => {
      const name = req.body.productName;
      const brand = req.body.productBrand;
      const price = req.body.productPrice;
      const discription = req.body.productDiscription;
      const code = req.body.productNumber;
      const pic = req.files.productImage;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const productImage = Buffer.from(encodedPic, "base64");
      const products = {
        name,
        brand,
        price,
        discription,
        code,
        productImage: productImage,
      };
      const result = await productCollection.insertOne(products);
      res.json(result);
    });

    app.get("/userprofiledata", async (req, res) => {
      const cursor = userProfileDataCollection.find({});
      const data = await cursor.toArray();
      res.send(data);
    });

    app.get("/products", async (req, res) => {
      const cursor = productCollection.find({});
      const products = await cursor.toArray();
      res.send(products);
    });
    // get single product

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const product = await productCollection.findOne(query);
      res.send(product);
    });

    // user collection
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = usersCollection.updateOne(filter, updateDoc, options);
      res.json(result);
    });
    app.put("/users/admin", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const updateDoc = { $set: { role: "admin" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // add user Profile Data
    app.post("/userprofile", async (req, res) => {
      const user = req.body;
      const result = await userProfileDataCollection.insertOne(user);
      res.json(result);
    });

    // payment intrigation
    app.get("/orders", async (req, res) => {
      const user = ordersCollection.find({});
      const users = await user.toArray();
      res.send(users);
    });
    app.post("/init", async (req, res) => {
      const data = {
        total_amount: req.body.product_price,
        currency: "BDT",
        tran_id: uuidv4(),
        success_url: "http://localhost:5000/success",
        fail_url: "http://localhost:5000/failure",
        cancel_url: "http://localhost:5000/cancel",
        ipn_url: "http://localhost:5000/ipn",
        shipping_method: "Courier",
        product_name: req.body.product_name,

        product_Code: req.body.product_code,
        paymentStatus: "pending",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: req.body.cus_name,
        cus_email: req.body.cus_email,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
        multi_card_name: "mastercard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
      };
      // insert to database

      const order = await ordersCollection.insertOne(data);
      const sslcommer = new SSLCommerzPayment(
        process.env.STORE_ID,
        process.env.STORE_PASSWORD,
        false
      );
      //true for live default false for sandbox
      sslcommer.init(data).then((data) => {
        //process the response that got from sslcommerz
        //https://developer.sslcommerz.com/doc/v4/#returned-parameters
        if (data.GatewayPageURL) {
          res.json(data.GatewayPageURL);
        } else {
          return res.status(400).json({
            message: "SSL session was not successful",
          });
        }
      });
    });

    app.post("/success", async (req, res) => {
      const result = await ordersCollection.updateOne(
        { tran_id: req.body.tran_id },
        {
          $set: {
            val_id: req.body.val_id,
          },
        }
      );

      res.redirect(
        `https://ecomproject-894a0.web.app/success/${req.body.tran_id}`
      );
    });

    app.post("/fail", async (req, res) => {
      const result = await ordersCollection.deleteOne({
        tran_id: req.body.tran_id,
      });
      res.status(200).redirect(`https://ecomproject-894a0.web.app/`);
    });
    app.post("/cancel", async (req, res) => {
      const result = await ordersCollection.deleteOne({
        tran_id: req.body.tran_id,
      });
      res.status(200).redirect(`https://ecomproject-894a0.web.app/`);
    });
    // delete orders
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.json(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("ElectroShop Server is Running");
});

app.listen(port, () => {
  console.log(`listening at ${port}`);
});
