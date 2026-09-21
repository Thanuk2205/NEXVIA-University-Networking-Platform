import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "./database.js";
import { User } from "./models.js";

try {
  await connectDatabase();
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env");
  if (password.length < 8) throw new Error("Seed admin password must contain at least 8 characters");

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await User.findOneAndUpdate(
    { email },
    { $set: { passwordHash, role: "admin", status: "active", emailVerified: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Admin account ready: ${admin.email}`);
} catch (error) {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
