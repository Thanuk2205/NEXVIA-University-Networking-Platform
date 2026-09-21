import mongoose from "mongoose";

export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
