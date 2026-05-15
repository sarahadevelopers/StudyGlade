const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://websitesbykaranja_db_user:33778477isme@studyglade.nd2nukb.mongodb.net/studyglade?retryWrites=true&w=majority&appName=Studyglade'; // your real URI

async function fixEmails() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('studyglade');
    const users = db.collection('users');
    const cursor = users.find({});
    let count = 0;
    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (user.email && user.email !== user.email.toLowerCase()) {
        await users.updateOne(
          { _id: user._id },
          { $set: { email: user.email.toLowerCase() } }
        );
        count++;
        console.log(`Fixed email: ${user.email} → ${user.email.toLowerCase()}`);
      }
    }
    console.log(`Done. Fixed ${count} users.`);
  } finally {
    await client.close();
  }
}
fixEmails().catch(console.error);