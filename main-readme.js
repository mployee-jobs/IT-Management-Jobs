import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";

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
const logger = () => {
  PROFILES_TO_INCLUDE.map((profile) =>
    console.log(`
		✅ Jobs fetched for ${profile}: ${PROFILE_JOBS_MAPPING?.[profile]?.length || 0}
		`)
  );
};

// ======================= Constants =======================
const TO_INCLUDE = {
  company: 1,
  company_url: 1,
  locationNew: 1,
  location: 1,
  title: 1,
  country: 1,
  postedDateTime: 1,
  posted_date: 1,
  job_link: 1,
  _id: 1,
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

// Calculate time ago from date
const getTimeAgo = (dateString) => {
  if (!dateString || dateString === "-") return "-";
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const days = Math.floor(seconds / 86400);
    
    if (days === 0) return "Today";
    if (days === 1) return "1d ago";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch {
    return dateString;
  }
};

// Get location badge with color
const getLocationBadge = (location) => {
  if (!location || location === "-") return "-";
  
  if (location.toLowerCase().includes("remote")) {
    return `![Remote](https://img.shields.io/badge/🌍_Remote-green)`;
  } else if (location.toLowerCase().includes("hybrid")) {
    return `![Hybrid](https://img.shields.io/badge/🏢_Hybrid-orange) ${location}`;
  } else {
    return `📍 ${location}`;
  }
};

// Get profile emoji
const getProfileEmoji = (profile) => {
  const emojiMap = {
    "Data Scientist": "📊",
    "Business Analyst": "💼",
    "Product Manager": "🚀",
    "Full Stack Developer": "💻",
  };
  return emojiMap[profile] || "📋";
};

// ======================= Service Layer =======================
const generateProfileRegex = async () => {
  try {
    const client = await getMainClient();
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
    const client = await getMarketingClient();
    const jobsCollection = getCollection(client, "jobs_it_mgmts");

    await Promise.all(
      PROFILES_TO_INCLUDE.map(async (profile) => {
        const regex = new RegExp(PROFILE_REGEX_MAPPING[profile], "i");
        PROFILE_JOBS_MAPPING[profile] = await jobsCollection
          .find({ title: regex }, { projection: TO_INCLUDE })
          .sort({ postedDateTime: -1 })
          .limit(1000)
          .toArray();
      })
    );

    logger();
  } catch (err) {
    console.error("[ERROR] Fetching jobs:", err);
    throw err;
  }
};

// ======================= README Generator =======================
const generateReadme = () => {
  try {
    console.log("🔄 Generating README.md...");

    // Calculate statistics
    let totalJobs = 0;
    let activeJobs = 0;
    let closedJobs = 0;
    let remoteJobs = 0;

    PROFILES_TO_INCLUDE.forEach((profile) => {
      const jobs = PROFILE_JOBS_MAPPING[profile] || [];
      totalJobs += jobs.length;
      jobs.forEach((job) => {
        if (job.job_link) activeJobs++;
        else closedJobs++;
        if ((job.locationNew || job.location || "").toLowerCase().includes("remote")) {
          remoteJobs++;
        }
      });
    });

    // README Header
    let content = `
<div align="center">

# 🚀 Tech Jobs Board

### Your Gateway to Amazing Career Opportunities

![Active Jobs](https://img.shields.io/badge/Active_Jobs-${activeJobs}-brightgreen?style=for-the-badge&logo=briefcase)
![Total Listings](https://img.shields.io/badge/Total_Listings-${totalJobs}-blue?style=for-the-badge&logo=database)
![Last Updated](https://img.shields.io/badge/Updated-${new Date().toLocaleDateString()}-orange?style=for-the-badge&logo=clock)

---

### 💡 **Quick Navigation**

`;

    // Profile links
    PROFILES_TO_INCLUDE.forEach((profile, idx) => {
      const anchor = profile.toLowerCase().replace(/\s+/g, "-");
      content += `[${getProfileEmoji(profile)} ${profile}](#${getProfileEmoji(profile)}-${anchor})`;
      if (idx < PROFILES_TO_INCLUDE.length - 1) content += " • ";
    });

    content += ` • [⬇️ Bottom](#-stay-connected)

</div>

---
`;

    // Generate sections for each profile
    PROFILES_TO_INCLUDE.forEach((profile) => {
      const jobs = PROFILE_JOBS_MAPPING[profile] || [];
      const emoji = getProfileEmoji(profile);
      const activeCount = jobs.filter((j) => j.job_link).length;

      content += `
## ${emoji} ${profile}

> 💼 **${activeCount}** active positions available

<table>
<thead>
<tr>
<th width="20%">🏢 Company</th>
<th width="35%">💼 Role</th>
<th width="20%">📍 Location</th>
<th width="10%">⏰ Posted</th>
<th width="15%">🔗 Apply</th>
</tr>
</thead>
<tbody>
`;

      if (jobs.length === 0) {
        content += `<tr><td colspan="5" align="center"><i>No positions available at the moment. Check back soon! 🔄</i></td></tr>\n`;
      } else {
        jobs.slice(0, 100).forEach((job) => {
          const company = job.company_url
            ? `<a href="${job.company_url}">${job.company || "-"}</a>`
            : job.company || "-";

          const role = job.title || "-";
          const location = getLocationBadge(job.locationNew || job.location);
          const posted = getTimeAgo(job.posted_date || job.postedDateTime);

          let apply;
          if (job.job_link) {
            apply = `<a href="${job.job_link}"><img src="https://img.shields.io/badge/Apply-Now-blue?style=flat-square&logo=briefcase" alt="Apply"></a>`;
          } else {
            apply = `<img src="https://img.shields.io/badge/Closed-red?style=flat-square&logo=lock" alt="Closed">`;
          }

          content += `<tr>
<td>${company}</td>
<td>${role}</td>
<td>${location}</td>
<td>${posted}</td>
<td align="center">${apply}</td>
</tr>\n`;
        });

        if (jobs.length > 100) {
          content += `<tr><td colspan="5" align="center"><i>... and ${jobs.length - 100} more positions</i></td></tr>\n`;
        }
      }

      content += `</tbody>
</table>

---
`;
    });

    // Statistics Section
    content += `
## 📈 Statistics

<div align="center">

| Metric | Count |
|:-------|------:|
| 🟢 Active Positions | **${activeJobs}** |
| 🔴 Closed Positions | **${closedJobs}** |
| 📊 Total Listings | **${totalJobs}** |
| 🌍 Remote Jobs | **${remoteJobs}** |
`;

    PROFILES_TO_INCLUDE.forEach((profile) => {
      content += `| ${getProfileEmoji(profile)} ${profile} | **${PROFILE_JOBS_MAPPING[profile]?.length || 0}** |\n`;
    });

    content += `
</div>

---

## 🎯 How to Apply?

<div align="center">

\`\`\`mermaid
graph LR
    A[📋 Browse Jobs] --> B[🔍 Find Your Match]
    B --> C[💼 Click Apply Now]
    C --> D[📝 Submit Application]
    D --> E[🎉 Get Hired!]
    
    style A fill:#e1f5ff
    style B fill:#fff3cd
    style C fill:#d4edda
    style D fill:#cfe2ff
    style E fill:#f8d7da
\`\`\`

</div>

### Steps to Apply:
1. 🔍 **Browse** through the positions above
2. 💼 **Click** the "Apply Now" button on your preferred role
3. 📝 **Complete** the application on the company's website
4. ✉️ **Wait** for the company to review your application
5. 🎉 **Celebrate** when you get the interview call!

---

## 🔔 Stay Updated

<div align="center">

### ⭐ Star this repository to receive updates on new job postings!

**This job board is automatically updated every 6 hours**

</div>

---

## 💬 Contributing

Found a broken link or want to add a job posting? Feel free to:
- 🐛 Open an issue
- 🔧 Submit a pull request
- 📧 Contact us directly

---

## 🙏 Stay Connected

<div align="center">

[![Website](https://img.shields.io/badge/Website-Visit-FF6B6B?style=for-the-badge&logo=google-chrome&logoColor=white)](https://yourwebsite.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/company/yourcompany)
[![Twitter](https://img.shields.io/badge/Twitter-Follow-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/yourcompany)
[![Discord](https://img.shields.io/badge/Discord-Join-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/yourserver)

---

### 📅 Last Updated

**${new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })}**

---

<sub>💼 Jobs aggregated from multiple sources • ⚡ Auto-updated every 6 hours • 🤖 Powered by GitHub Actions</sub>

**Made with ❤️ for the Tech Community**

⬆️ [Back to Top](#-tech-jobs-board) ⬆️

</div>
`;

    // Write to file
    fs.writeFileSync("README.md", content);
    console.log("✅ README.md generated successfully!");
    console.log(`📊 Statistics:`);
    console.log(`   - Total jobs: ${totalJobs}`);
    console.log(`   - Active jobs: ${activeJobs}`);
    console.log(`   - Closed jobs: ${closedJobs}`);
    console.log(`   - Remote jobs: ${remoteJobs}`);
  } catch (err) {
    console.error("[ERROR] Generating README:", err);
    throw err;
  }
};

// ======================= Main Orchestration =======================
const main = async () => {
  try {
    await generateProfileRegex(); // from MAIN DB
    await fetchJobs(); // from MARKETING DB
    generateReadme(); // Generate README
    console.log("✅ Job fetching and README generation complete");
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