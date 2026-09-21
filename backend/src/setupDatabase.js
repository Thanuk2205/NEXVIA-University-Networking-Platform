import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "./database.js";
import { allModels } from "./models.js";

try {
  const connection = await connectDatabase();
  for (const dbModel of allModels) await dbModel.syncIndexes();
  console.log(`Nexvia database ready: ${connection.name}`);
  console.log(`Collections/indexes synchronized for ${allModels.length} models.`);
} catch (error) {
  console.error("Database setup failed:", error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
