import { MongoClient } from "mongodb";
import dotenv from "dotenv"
dotenv.config();

let client1 // for main DB profile Categorizatoin
let client2 // for marketing DB fetching jobs

const connectDB = async (uri) => {
	try {

		// const uri = process.env.MONGO_URL || "mongodb://18.61.175.31:7546/";
		const client = new MongoClient(uri);
		await client.connect();
		return client;

	} catch (err) {
		console.log("[ERROR] while connecting to DB:", err.message);
		throw err;
	}
};

const getCollection = async (client, COLLECTION, DB = "test") => {
	try {

		const db = client.db(DB);
		const collection = db.collection(COLLECTION)

		return collection;

	} catch (err) {
		console.log("[ERROR] while fetching the collections and db ", err.message)
		throw err;
	}
}







const TO_INCLUDE = {
	company: 1,
	locationNew: 1,
	title: 1,
	country: 1,
	postedDateTime: 1,
	_id: -1
}

const PROFILES_TO_INCLUDE = ["Data Scientist", "Business Analyst", "Product Manager", "Full Stack Developer"]
const PROFILE_REGEX_MAPPING = {}

const PROFILE_JOBS_MAPPING = {}


const convertProfileArrayIntoRegex = (profileRegex)=>{
	 return profileRegex.map(p => `\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join("|");
}


const generateProfileRegex = async (client) => {
	try {

		const profileCategorization = await getCollection(client, "profilecategorizations");
		const profileWithRegex =  await profileCategorization.find(
		{
			profile: { $in: PROFILES_TO_INCLUDE },
		},
		{
				projection: {
					profile: 1,
					profileRegex: 1,
					_id : 0,
				}
		}).toArray();
		// console.log(profileWithRegex);


		profileWithRegex.forEach(profileDoc=>{
			PROFILE_REGEX_MAPPING[profileDoc?.profile] = convertProfileArrayIntoRegex(profileDoc.profileRegex)
		})

		return true

	} catch (err) {
		console.log("[ERROR] while generating the profile regex : ", err);
		throw err;
	}
}


const fetchJobs = async(client)=>{
	try{
		
		const ItJobs = await getCollection(client , "jobs_it_mgmts");

		// await Promise.all(PROFILES_TO_INCLUDE.map(async(profile))=>{
		// 	PROFILE_JOBS_MAPPING[profile] = await ItJobs.find({
		// 		title : RegExp(PROFILE_REGEX_MAPPING[profile] , "i")
		// 	})
		// })

		await Promise.all(PROFILES_TO_INCLUDE.map(async(profile)=>{
			PROFILE_JOBS_MAPPING[profile] = await ItJobs.find({title : RegExp(PROFILE_REGEX_MAPPING[profile] , "i")} , {
				projection : TO_INCLUDE
			}).limit(1000).toArray(); 
		}))

		console.log(PROFILE_JOBS_MAPPING["Full Stack Developer"].length)

	}catch(err){
		console.log("[ERROR] while fetching jobs : " , err.message);
	}
}


const main = async () => {
	try {

		// establishing connection with db
		client1 = await connectDB(process.env.MARKETING_URI);
		client2 = await connectDB(process.env.MONGO_URL);

		// ======================== this function is to fetch the profile catgprization collection and create a mapping =>       profile -> convertedIntoRegex(profileRegex) ===============  
		await generateProfileRegex(client1)

		// ===================== now we have profile with regex mapping ====================================
		await fetchJobs(client2);

		console.log("done job fetching")

		




	} catch (err) {
		console.log("[ERROR] in main function:", err.message);
	}finally{
		client.close();
	}
};

main();
