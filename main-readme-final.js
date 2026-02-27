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
    console.log(`✅ Jobs fetched for ${profile}: ${PROFILE_JOBS_MAPPING?.[profile]?.length || 0}`)
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
  _id: 1,
  "Job ID (Numeric)": 1
};

const PROFILES_TO_INCLUDE = [
  "Data Scientist",
  "Business Analyst",
  "Product Manager",
  "Full Stack Developer",
];

const PROFILE_REGEX_MAPPING = {};
const PROFILE_JOBS_MAPPING = {};
const PROFILE_MAPPING_WITH_JOB_PAGES = {};

// ======================= Utility =======================
const convertProfileArrayIntoRegex = (profileRegex) =>
  profileRegex
    .map((p) => `\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    .join("|");

// Create URL-friendly slug
function createSlug(text) {
  if (!text) return ''
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
}

// Generate dynamic job URL
const generateJobUrl = (job, profile) => {
  const companySlug = createSlug(job.company);
  const locationSlug = PROFILE_MAPPING_WITH_JOB_PAGES[profile]["location"]
  const profileSlug = PROFILE_MAPPING_WITH_JOB_PAGES[profile]["profile"]

  // Base URL from environment or default
  const baseUrl = process.env.WEBSITE_URL || 'https://yourwebsite.com';

  return `${baseUrl}/us/jobs/view/${profileSlug}-in-${locationSlug}-at-${companySlug}-${job["Job ID (Numeric)"]}/us1`;
};

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
    const jobsCollection = getCollection(client, "jobs_it_mgmts_usa");

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
    let remoteJobs = 0;

    PROFILES_TO_INCLUDE.forEach((profile) => {
      const jobs = PROFILE_JOBS_MAPPING[profile] || [];
      totalJobs += jobs.length;
      jobs.forEach((job) => {
        if ((job.locationNew || job.location || "").toLowerCase().includes("remote")) {
          remoteJobs++;
        }
      });
    });

    // README Header
    let content = `
<div align="center">

# <h1>IT Entry Level Jobs in USA | Updated Daily</h1>

![Updated Daily](https://img.shields.io/badge/Updated_Daily-green?style=for-the-badge&logo=clock)
![Location: USA](https://img.shields.io/badge/Location:_USA-blue?style=for-the-badge&logo=googlemaps)
![0–2 Years Experience](https://img.shields.io/badge/0–2_Years_Experience-orange?style=for-the-badge&logo=education)
![Direct Apply Links](https://img.shields.io/badge/Direct_Apply_Links-green?style=for-the-badge&logo=link)


<p>If you're searching for IT entry level jobs in the United States, this repository helps you find verified, active roles across software engineering, IT support, data analytics, cybersecurity, cloud and DevOps domains.</p>

---

<div align="left">

<p>
We track real entry-level tech jobs designed for candidates with 0–2 years of experience, including recent graduates, bootcamp students and early-career professionals.
</p>

- ✅ **Require 0-2 years of experience**
- 🇺🇸 **Based in the USA**
- 🕒 **Updated every 24 hours**
- 🔗 **Direct links to company career pages**

</div>


---


<div align="center">
<div style="
background-color:#0d1117;
border:1px solid #30363d;
border-radius:12px;
padding:20px;
width:100%;
max-width:800px;
color : white;
">

<p>
	<b>Applying to entry level jobs ?</b>
</p>


<p>
	<i>Make sure your resume passes the ATS filters</i>
</p>

<a href="https://www.mployee.me/resumescan?utm_source=new_grad_jobs&utm_medium=github&utm_campaign=seo_mkt" target="_blank">
	<img 
  src="https://img.shields.io/badge/-Resume%20Checker-243c7c?style=for-the-badge" 
  alt="Resume Checker"
  width="300"
/>
</a>

<hr style="height:1px;border:none;background-color:#30363d;">


</div>
</div>


### <h2>Types of IT entry level jobs we track:</h2>

<div align="center">
<table width="100%">
  <thead>
    <tr style="background-color: #f8f9fa;">
      <th align="left" style="padding: 10px;">💻 Software Engineering</th>
      <th align="left" style="padding: 10px;">🛠️ IT Support & Infrastructure</th>
      <th align="left" style="padding: 10px;">☁️ Cloud & DevOps</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="top" style="padding: 10px;">
        <ul style="list-style: none; padding-left: 0; margin: 0;">
          <li>🟢 Junior Software Engineer</li>
          <li>🟢 Entry Level Frontend Developer</li>
          <li>🟢 Backend Developer (Junior)</li>
          <li>🟢 QA Engineer</li>
        </ul>
      </td>
      <td valign="top" style="padding: 10px;">
        <ul style="list-style: none; padding-left: 0; margin: 0;">
          <li>🟢 IT Support Specialist</li>
          <li>🟢 Help Desk Technician</li>
          <li>🟢 System Administrator (Entry Level)</li>
          <li>🟢 Desktop Support</li>
        </ul>
      </td>
      <td valign="top" style="padding: 10px;">
        <ul style="list-style: none; padding-left: 0; margin: 0;">
          <li>🟢 Junior Cloud Engineer</li>
          <li>🟢 DevOps Engineer (Entry Level)</li>
          <li>🟢 AWS / Azure Associate Roles</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>
</div>


<table>
<tr>
`;

    // Profile navigation cards - 4 in a row
    PROFILES_TO_INCLUDE.forEach((profile) => {
      const emoji = getProfileEmoji(profile);
      const anchor = profile.toLowerCase().replace(/\s+/g, "-");
      const jobCount = PROFILE_JOBS_MAPPING[profile]?.length || 0;

      content += `<td align="center" width="25%">
<a href="#-${anchor}">
<img src="https://img.shields.io/badge/${emoji}_${profile.replace(/ /g, '_')}-${jobCount}_Jobs-blue?style=for-the-badge" alt="${profile}">
</a>
<br>
<sub><b>${jobCount}</b> total positions</sub>
</td>
`;
    });

    content += `</tr>
</table>

</div>

---
`;

    // Generate sections for each profile
    PROFILES_TO_INCLUDE.forEach((profile) => {
      const jobs = PROFILE_JOBS_MAPPING[profile] || [];
      const emoji = getProfileEmoji(profile);
      const anchor = profile.toLowerCase().replace(/\s+/g, "-");

      content += `
## ${emoji} ${profile}
<a name="-${anchor}"></a>

> 💼 **${jobs.length}** positions available

<table>
<thead>
<tr>
<th width="20%">🏢 Company</th>
<th width="35%">💼 Role</th>
<th width="20%">📍 Location</th>
<th width="10%">⏰ Posted</th>
<th width="15%">🔗 Action</th>
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

          // Generate dynamic URL for your website
          const jobUrl = generateJobUrl(job, profile);
          const apply = `<a target="_blank" rel="noopener noreferrer" href="${jobUrl}"><img src="https://img.shields.io/badge/View-Job-blue?style=flat-square&logo=briefcase" alt="View Job"></a>`;

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

    // Popular IT entry level jobs section (Refined to Badge Style)
    content += `
### <h2>🔍 <font color="#58a6ff"> Popular IT entry jobs</font></h2>

<p align="center">
If these were not the jobs you were looking for, try searching based on the profile:
</p>

<p align="center">
<a href="https://www.mployee.me/us/jobs/software-developer-jobs"><img src="https://img.shields.io/badge/Software_Developer-0078D4?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/data-engineer-jobs"><img src="https://img.shields.io/badge/Data_Engineer-28A745?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/business-analyst-jobs"><img src="https://img.shields.io/badge/Business_Analyst-FFC107?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/data-scientist-jobs"><img src="https://img.shields.io/badge/Data_Scientist-6F42C1?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/python-developer-jobs"><img src="https://img.shields.io/badge/Python_Developer-3776AB?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/ai-solution-specialist-jobs"><img src="https://img.shields.io/badge/AI--Solution_Specialist-00A4EF?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/accountant-jobs"><img src="https://img.shields.io/badge/Accountant-D22128?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/sales-manager-jobs"><img src="https://img.shields.io/badge/Sales-00A3A0?style=for-the-badge&logoColor=white" /></a>
<a href="https://www.mployee.me/us/jobs/finance-executive-jobs"><img src="https://img.shields.io/badge/Finance_Executive-E91E63?style=for-the-badge&logoColor=white" /></a>
</p>

---
`;

    // Statistics Section
    content += `
## 📈 Statistics

<div align="center">

| Metric | Count |
|:-------|------:|
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
    B --> C[💼 Click View Job]
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
2. 💼 **Click** the "View Job" button on your preferred role
3. 📝 **Complete** the application on our website
4. ✉️ **Wait** for us to review your application
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

[![Website](https://img.shields.io/badge/Website-Visit-FF6B6B?style=for-the-badge&logo=google-chrome&logoColor=white)](${process.env.WEBSITE_URL || 'https://yourwebsite.com'})
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/company/yourcompany)
[![Twitter](https://img.shields.io/badge/Twitter-Follow-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/yourcompany)
[![Discord](https://img.shields.io/badge/Discord-Join-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/yourserver)

---

### 📅 Last Updated

**${new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    })
      }**

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
    console.log(`   - Remote jobs: ${remoteJobs}`);
  } catch (err) {
    console.error("[ERROR] Generating README:", err);
    throw err;
  }
};

// ======================== Job Pages Mapping With Profile =============
const mapJobPages = async () => {
  try {

    const client = await getMarketingClient();
    const jobPagesCollection = await getCollection(client, "usJobPages");
    const jobPages = await jobPagesCollection
      .find({ title: { $in: PROFILES_TO_INCLUDE } })
      .sort({ createdAt: -1 })
      .toArray();

    jobPages.forEach(jobPage => {
      PROFILE_MAPPING_WITH_JOB_PAGES[jobPage?.["title"]] = { profile: jobPage?.["tag1"], location: jobPage?.["tag2"] }
    })

    console.log("✅ JobPages mapped with profiles");

  } catch (err) {
    console.log("[ERROR] in MapJobPages function : ", err.message)
  }
}

// ======================= Main Orchestration =======================
const main = async () => {
  try {
    await generateProfileRegex(); // from MAIN DB
    await fetchJobs(); // from MARKETING DB
    await mapJobPages(); // mapping the job pages with profile
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
