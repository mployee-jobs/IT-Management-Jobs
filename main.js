import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// ======================= Singleton MongoClients =======================
let mainClient;
let marketingClient;

const getMainClient = async () => {
  if (!mainClient) {
    mainClient = new MongoClient(process.env.MONGO_URL, { maxPoolSize: 10 });
    await mainClient.connect();
    console.log("✅ Connected to Main DB");
  }
  return mainClient;
};

const getMarketingClient = async () => {
  if (!marketingClient) {
    marketingClient = new MongoClient(process.env.MARKETING_URI, { maxPoolSize: 10 });
    await marketingClient.connect();
    console.log("✅ Connected to Marketing DB");
  }
  return marketingClient;
};

// ======================= DB Helper =======================
const getCollection = (client, collectionName, dbName = "test") =>
  client.db(dbName).collection(collectionName);


// ====================== Logger ===========================
const logger = ()=>{
	PROFILES_TO_INCLUDE.map(profile=>  console.log(`
		✅ Jobs fetched for ${profile}: ${PROFILE_JOBS_MAPPING?.[profile]?.length || 0}
		`) )
}

// ======================= Constants =======================
const TO_INCLUDE = {
  company: 1,
  locationNew: 1,
  title: 1,
  country: 1,
  postedDateTime: 1,
  _id: -1,
};

const PROFILES_TO_INCLUDE = [
  "Data Scientist",
  "Business Analyst",
  "Product Manager",
  "Full Stack Developer",
];

const PROFILE_REGEX_MAPPING = {};
const PROFILE_JOBS_MAPPING = {};

// ======================= Utility =======================
const convertProfileArrayIntoRegex = (profileRegex) =>
  profileRegex
    .map((p) => `\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    .join("|");

// ======================= Service Layer =======================
const generateProfileRegex = async () => {
  try {
    const client = await getMainClient(); // MAIN DB for profileCategorization
    const profileCollection = getCollection(client, "profilecategorizations");

    const profiles = await profileCollection
      .find(
        { profile: { $in: PROFILES_TO_INCLUDE } },
        { projection: { profile: 1, profileRegex: 1, _id: 0 } }
      )
      .toArray();

    profiles.forEach((profileDoc) => {
      PROFILE_REGEX_MAPPING[profileDoc.profile] = convertProfileArrayIntoRegex(
        profileDoc.profileRegex
      );
    });

    console.log("✅ Profile regex mapping generated");
  } catch (err) {
    console.error("[ERROR] Generating profile regex:", err);
    throw err;
  }
};

const fetchJobs = async () => {
  try {
    const client = await getMarketingClient(); // MARKETING DB for jobs
    const jobsCollection = getCollection(client, "jobs_it_mgmts");

    await Promise.all(
      PROFILES_TO_INCLUDE.map(async (profile) => {
        const regex = new RegExp(PROFILE_REGEX_MAPPING[profile], "i");
        PROFILE_JOBS_MAPPING[profile] = await jobsCollection
          .find({ title: regex }, { projection: TO_INCLUDE })
          .limit(1000)
          .toArray();
      })
    );

	logger()

  } catch (err) {
    console.error("[ERROR] Fetching jobs:", err);
    throw err;
  }
};

// ======================= Main Orchestration =======================
const main = async () => {
  try {
    await generateProfileRegex(); // from MAIN DB
    await fetchJobs();            // from MARKETING DB
    console.log("✅ Job fetching complete");
  } catch (err) {
    console.error("[ERROR] Main function:", err);
  } finally {
    // Safely close both DB connections
    if (mainClient) await mainClient.close();
    if (marketingClient) await marketingClient.close();
    console.log("✅ MongoDB connections closed");
  }
};

main();
