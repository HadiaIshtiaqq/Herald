import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { PullRequest, DashboardStats } from "./src/types.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Shared Gemini Client on server side
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// In-memory data store for Pull Requests
let prs: PullRequest[] = [
  {
    id: "PR-42",
    title: "feat: Implement Graph API integration",
    authorName: "Monica Davis",
    authorHandle: "@dev_monica",
    authorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMY6at6hjEmYYrZvySrFffmJHjvJMKoqcIh2lkoPHQJKhKYMuUGLeZnkzA3AujRXxrR4BgyP2S-3PKCwczrODBJFzEQTMWMVGZg2kForeSSCQJhyvRyS9RsASGowXfKH2bN_0IG1Zk-38GorBLao1vVZ6G1nFyFtWbhvkciOgPqY7bRN3hnDl1xL_SCoAzqnkmoqm7JvpFe5ekxh0CidFLhOUPW01or09VLjTrvFd1LvBNY8vhhLtqDQv7Xa0uVBGTxsjI8gqmEgs",
    type: "FEATURE",
    branch: "feature/graph-api",
    risk: "Medium",
    riskDetail: "Scoped to Graph Module only.",
    filesChanged: 24,
    methodsImpacted: 112,
    status: "Pending Review",
    version: "2.4.0-rc1",
    description: "This PR introduces the core infrastructure for the Microsoft Graph API integration, including authentication middleware, shared context providers, and basic endpoint mapping for user presence and calendar events. It refactors AuthContext and establishes token refresh heuristics.",
    changelog: "# Release Notes - v2.4.0-rc1\n\n## Added\n- Core Graph API middleware for authentication.\n- User presence polling service (interval: 30s).\n- Calendar event synchronization hooks.\n\n## Improved\n- Refactored `AuthContext` to support multiple providers.\n- Optimized cache eviction for identity tokens.\n\n\n*// End of AI generated markdown //*",
    teamsPost: "**Release Updates: Graph API Integration is Ready!**\n\nWe have completed the deployment candidates for `v2.4.0-rc1`. Monica Davis has successfully implemented the Graph API middleware, allowing multi-provider presence polling and calendar synchronization. This is low risk and scoped tightly to the auth gateway.\n\n*Approved by DevOps Lead*",
    reasoningTrace: [
      {
        title: "Code Scanning",
        description: "Analyzed 1,402 lines of code. Detected new OAuth2.0 flows and token management logic.",
        status: "success",
        icon: "FileSearch"
      },
      {
        title: "Dependency Mapping",
        description: "Mapped integration to `IdentityServer4` and `InternalCacheSvc`. No circular deps detected.",
        status: "success",
        icon: "GitBranch"
      },
      {
        title: "Security Heuristics",
        description: "Identified potential token exposure risk in dev logging. Mitigation: Redacted output added.",
        status: "warning",
        icon: "ShieldAlert"
      },
      {
        title: "Artifact Generation",
        description: "Summarized changes for stakeholders and technical teams based on git history.",
        status: "success",
        icon: "FileSignature"
      }
    ],
    approved: false,
    verified: false,
    reviewer: "Sarah Jenkins",
    priority: "Medium",
    changedFiles: ["server/auth/middleware.ts", "server/auth/context.ts", "src/hooks/useAuth.ts", "src/components/GraphDashboard.tsx"],
  },
  {
    id: "PR-4209",
    title: "feat: Implement dynamic bento grid",
    authorName: "Alex Chen",
    authorHandle: "@alex_chen",
    authorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuA7W0TLIMEt02zyyh_auB7fMEeMXyA4fu4GjS909UorBu98fPVir9sm7DO7m-dmjKuM9RGX9XeMcWVEwNuZjtw4FC_SLbDE3n2iWk6QkS0kXOYULoYhFnoS6O5Yy2DZCy0clF3fdY5ypgdKFHb-8zS3k_RquAQl8UpB090uSzVY4Ho1xS0jWmCCw0-nYN5etFlsaM_i9wJWqi0uxflLwZaVxNsoXxniKIcfMPxEo2v4ydS1La4sc-zqhla9C5VW4U-l_aDhSUL45q8",
    type: "FEATURE",
    branch: "dashboard-revamp",
    risk: "Medium",
    riskDetail: "Front-end and layout adjustments. Highly visual.",
    filesChanged: 12,
    methodsImpacted: 35,
    status: "Released",
    version: "2.4.0-stable",
    description: "Replaces standard layout with responsive bento grids, enabling customized draggable widget cards, live metrics stream, and adjustable density states.",
    changelog: "# Release Notes - Bento Grid Update\n\n- Added bento grid structure to main landing overview.\n- Made widget panels fully responsive.\n- Improved browser compatibility on mobile sizes.",
    teamsPost: "Announcing the Bento Grid layout rollout! Desktop viewers can now enjoy high density panels.",
    reasoningTrace: [
      {
        title: "Layout Check",
        description: "Validated Tailwind grid configurations and breakpoints.",
        status: "success",
        icon: "LayoutGrid"
      }
    ],
    approved: true,
    verified: true,
    reviewer: "Emily Diaz",
    priority: "Low",
    changedFiles: ["src/components/BentoGrid.tsx", "src/components/ActivityDashboard.tsx", "src/App.tsx"],
  },
  {
    id: "PR-4212",
    title: "fix: Memory leak in auth hook",
    authorName: "Sarah Miller",
    authorHandle: "@sarah_m",
    authorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBaF7y41sGSfwTiHijH1GE6KtgoIYkZjr0RIrqVB9fN0jyGRJ3Lty91VCMwINHjLKQB4CTsM6O84984xNOb2o0HGqTktJ6fvci1V5Il3hBTw4jh3_bz3qdJy8DEfKcPGoLgFekZgHaC0BR-o8aP9gmaD9ZZG0vGQUkjrJYxJzsBpD3nbSpkk13lVZgVPb7KAJjyj4wehUMqm5v9e8kfOccyeL9-8Wn_3VmlAPhb4noVcI66-vVZi96BbEmfm4xIkTfIAT0afmCpu60",
    type: "BUGFIX",
    branch: "fix/auth-leak",
    risk: "High",
    riskDetail: "Affects core session persistence and hooks. Critical memory profile.",
    filesChanged: 4,
    methodsImpacted: 18,
    status: "In Progress",
    version: "2.4.1-rc2",
    description: "Disposes window timers and event listeners inside `useAuth` hook cleanup cycle. Prevents infinite retains during route swaps.",
    changelog: "# Bugfix - Auth Hook Memory Leak\n\n- Cleared window intervals on auth unmount.\n- Redefined closures in storage listener handlers.",
    teamsPost: "Critical fix under review: Sarah resolved memory leaks occurring during rapid login swaps. Deploying.",
    reasoningTrace: [
      {
        title: "Memory profiling",
        description: "Detected leakage of 12MB/min on active browser simulation.",
        status: "error",
        icon: "ShieldAlert"
      },
      {
        title: "Heuristic patch",
        description: "Applied ref/timer clearing inside React useEffect return function.",
        status: "success",
        icon: "FileCheck"
      }
    ],
    approved: false,
    verified: false,
    reviewer: "Alex Rover",
    priority: "Critical",
    changedFiles: ["src/hooks/useAuth.ts", "src/context/AuthContext.tsx", "server/auth/context.ts"],
  },
  {
    id: "PR-4198",
    title: "chore: Update dependencies",
    authorName: "John Doe",
    authorHandle: "@john_doe",
    authorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBBRLocNrTTamNHTajDYF6NvGQh2VlUu6_CyLG4GsXhOpyCEFACHjzuO1zvGkMdARNOGCtBUtwnmiOih8t7gLAqJcUR-XyFJujyYOmFUGy1W61SBVtdMsBsRTGMnzLBTn-e7rJmGhLHbLT3ko-2PxhlYYuP68eLcZQFnkFuX4qOEc4Np22T2eaWni9d9CdsnYn8thVbhiGeajLsjxhvQ1GhKMgPzsD1E89uy7TwKa7WF7vZbHNo44r5dMRpKtzQRaNAHJgxZFkFMvY",
    type: "CHORE",
    branch: "chore/deps",
    risk: "Low",
    riskDetail: "Trivial package bump of non-critical developer utilities.",
    filesChanged: 2,
    methodsImpacted: 0,
    status: "Pending Review",
    version: "2.4.1-rc1",
    description: "Bumps typescript development tools and eslint compliance package arrays to their closest patch versions.",
    changelog: "Updates development tools compile pipelines.",
    teamsPost: "Chore: developer tooling minor bump is ready to merge.",
    reasoningTrace: [
      {
        title: "Security Check",
        description: "Ran npm audit. 0 vulnerabilities found.",
        status: "success",
        icon: "ShieldCheck"
      }
    ],
    approved: false,
    verified: false,
    reviewer: "Carter Smith",
    priority: "Low",
    changedFiles: ["package.json", "package-lock.json"],
  },
  {
    id: "PR-4215",
    title: "refactor: Optimize API queries",
    authorName: "Elena Rodriguez",
    authorHandle: "@elena_r",
    authorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDgvDA6LO_4_YGUKr_ECGZ04ecSbOW6bHHQeDbxAI_dg1dPVHtxfdlVLWH3EcPOGH168SSEt918zW3X6tlhX0-uk4e5xfqte9jb9xBfdiTht53pJP9AG47iZn9Y59bi19IrqJ3U6GSk2tJxL2HFOYWaomj9CnJ8tHq5XF69jv_Dq4rpw3uvFJ2DLPLfxHwcslMJKl2evtlHk47WGuYzJLR9R9fIXLP92AySxnRofhHZQJz4-k1YI76pO49o9JcVrzW4DrkM48xmI4s",
    type: "FEATURE",
    branch: "refactor/api",
    risk: "Medium",
    riskDetail: "DB index optimizations for faster lookup speeds.",
    filesChanged: 8,
    methodsImpacted: 44,
    status: "Released",
    version: "2.4.0-rc3",
    description: "Adds partial indexes on user subscription status to trim lookups from 400ms to <15ms inside the dashboard loader routes.",
    changelog: "# Optimization Report\n- Added composite index on sub statuses.\n- Simplified ORM query builders.",
    teamsPost: "Elena refactored main user profile endpoints. Latency plummeted from 400ms to 12ms!",
    reasoningTrace: [
      {
        title: "Execution Query Trace",
        description: "Index utilization verified via query analyzers.",
        status: "success",
        icon: "TrendingUp"
      }
    ],
    approved: true,
    verified: true,
    reviewer: "Sarah Jenkins",
    priority: "High",
    changedFiles: ["server/db/composite-index.sql", "server/controllers/userController.ts", "src/components/ActivityDashboard.tsx"],
  }
];

// In-memory global analytics stats
const stats: DashboardStats = {
  activePRsCount: 24,
  avgRiskLevel: "Medium",
  deploySpeed: "12m 40s",
  rollbackRate: "0.4%",
  totalReleases7d: 114,
  successRate: "99.6%",
  activePipelinesCount: 3,
};

// 1. Get stats
app.get("/api/stats", (req, res) => {
  res.json({
    ...stats,
    activePRsCount: prs.length,
    activePipelinesCount: prs.filter(p => p.status === 'In Progress').length || 3
  });
});

// 2. Get list of pull requests
app.get("/api/prs", (req, res) => {
  res.json(prs);
});

// 3. Create a custom release/PR
app.post("/api/prs", (req, res) => {
  const { title, authorName, type, status, description, branch, reviewer, priority } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const generatedId = `PR-${Math.floor(1000 + Math.random() * 9000)}`;
  const authorHandle = `@${(authorName || 'developer').toLowerCase().replace(/\s+/g, '_')}`;
  
  // Standard avatars fallback
  const avatars = [
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA7W0TLIMEt02zyyh_auB7fMEeMXyA4fu4GjS909UorBu98fPVir9sm7DO7m-dmjKuM9RGX9XeMcWVEwNuZjtw4FC_SLbDE3n2iWk6QkS0kXOYULoYhFnoS6O5Yy2DZCy0clF3fdY5ypgdKFHb-8zS3k_RquAQl8UpB090uSzVY4Ho1xS0jWmCCw0-nYN5etFlsaM_i9wJWqi0uxflLwZaVxNsoXxniKIcfMPxEo2v4ydS1La4sc-zqhla9C5VW4U-l_aDhSUL45q8",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBaF7y41sGSfwTiHijH1GE6KtgoIYkZjr0RIrqVB9fN0jyGRJ3Lty91VCMwINHjLKQB4CTsM6O84984xNOb2o0HGqTktJ6fvci1V5Il3hBTw4jh3_bz3qdJy8DEfKcPGoLgFekZgHaC0BR-o8aP9gmaD9ZZG0vGQUkjrJYxJzsBpD3nbSpkk13lVZgVPb7KAJjyj4wehUMqm5v9e8kfOccyeL9-8Wn_3VmlAPhb4noVcI66-vVZi96BbEmfm4xIkTfIAT0afmCpu60",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBBRLocNrTTamNHTajDYF6NvGQh2VlUu6_CyLG4GsXhOpyCEFACHjzuO1zvGkMdARNOGCtBUtwnmiOih8t7gLAqJcUR-XyFJujyYOmFUGy1W61SBVtdMsBsRTGMnzLBTn-e7rJmGhLHbLT3ko-2PxhlYYuP68eLcZQFnkFuX4qOEc4Np22T2eaWni9d9CdsnYn8thVbhiGeajLsjxhvQ1GhKMgPzsD1E89uy7TwKa7WF7vZbHNo44r5dMRpKtzQRaNAHJgxZFkFMvY",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDgvDA6LO_4_YGUKr_ECGZ04ecSbOW6bHHQeDbxAI_dg1dPVHtxfdlVLWH3EcPOGH168SSEt918zW3X6tlhX0-uk4e5xfqte9jb9xBfdiTht53pJP9AG47iZn9Y59bi19IrqJ3U6GSk2tJxL2HFOYWaomj9CnJ8tHq5XF69jv_Dq4rpw3uvFJ2DLPLfxHwcslMJKl2evtlHk47WGuYzJLR9R9fIXLP92AySxnRofhHZQJz4-k1YI76pO49o9JcVrzW4DrkM48xmI4s"
  ];
  const authorAvatar = avatars[Math.floor(Math.random() * avatars.length)];

  // Pick some files from a common file pool so we can demonstrate overlapping files
  const filesPool = [
    "src/App.tsx",
    "src/index.css",
    "src/types.ts",
    "src/components/Sidebar.tsx",
    "src/components/ActivityDashboard.tsx",
    "src/components/ReleaseWorkspace.tsx",
    "src/components/NewReleaseDialog.tsx",
    "src/components/PerformanceMonitor.tsx",
    "server.ts",
    "server/auth/middleware.ts",
    "server/auth/context.ts",
    "src/hooks/useAuth.ts",
    "package.json"
  ];
  // select random count of files
  const filesCount = Math.floor(2 + Math.random() * 4);
  const shuffled = [...filesPool].sort(() => 0.5 - Math.random());
  const changedFiles = shuffled.slice(0, filesCount);

  const newPr: PullRequest = {
    id: generatedId,
    title,
    authorName: authorName || "Unassigned dev",
    authorHandle,
    authorAvatar,
    type: type || "FEATURE",
    branch: branch || "dev-main",
    risk: "Medium",
    riskDetail: "Analyzing queue...",
    filesChanged: filesCount,
    methodsImpacted: Math.floor(5 + Math.random() * 80),
    status: status || "Pending Review",
    version: `2.4.1-${generatedId.toLowerCase()}`,
    description: description || "No detailed description supplied yet.",
    changelog: `# Release Changelog - ${generatedId}\n\nAnalyzing changes... Run analyze step to expand.`,
    teamsPost: `Deploy candidate ${generatedId} created by ${authorName}.`,
    reasoningTrace: [
      {
        title: "Ingestion Queue",
        description: "Pull request synced to Release Concierge gateway.",
        status: "info",
        icon: "Inbox"
      }
    ],
    approved: false,
    verified: false,
    reviewer: reviewer || ["Sarah Jenkins", "Alex Rover", "Emily Diaz", "Carter Smith"][Math.floor(Math.random() * 4)],
    priority: priority || ["Low", "Medium", "High", "Critical"][Math.floor(Math.random() * 4)],
    changedFiles,
  };

  prs.unshift(newPr);
  res.status(201).json(newPr);
});

// Update reviewer endpoint
app.post("/api/prs/:id/reviewer", (req, res) => {
  const { id } = req.params;
  const { reviewer } = req.body;
  const pr = prs.find(p => p.id === id);
  if (!pr) {
    return res.status(404).json({ error: "Pull request not found" });
  }
  pr.reviewer = reviewer;
  res.json(pr);
});

// Update priority endpoint
app.post("/api/prs/:id/priority", (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;
  const pr = prs.find(p => p.id === id);
  if (!pr) {
    return res.status(404).json({ error: "Pull request not found" });
  }
  pr.priority = priority;
  res.json(pr);
});

// 4. Gemini reasoning step and artifact generator
app.post("/api/prs/:id/analyze", async (req, res) => {
  const { id } = req.params;
  const prIndex = prs.findIndex(p => p.id === id);
  if (prIndex === -1) {
    return res.status(404).json({ error: "Pull request not found" });
  }

  const pr = prs[prIndex];

  // If Gemini API is not available or key is empty, run a high-fidelity synthetic fallback
  if (!ai) {
    setTimeout(() => {
      // High fidelity synthetic generation mimicking requested designs
      pr.risk = pr.type === 'BUGFIX' ? 'High' : (Math.random() > 0.4 ? 'Medium' : 'Low');
      pr.riskDetail = `Synthetic risk assessment: Scoped to the ${pr.branch} branch array modules only. Minimal upstream implications.`;
      pr.filesChanged = Math.floor(pr.filesChanged || 15);
      pr.methodsImpacted = Math.floor(pr.methodsImpacted || 48);

      pr.changelog = `# Release Notes - ${pr.version || 'v2.4.1'}\n\n## Added\n- Built infrastructure for ${pr.title}.\n- Added comprehensive unit mapping verification sweeps.\n\n## Improved\n- Enhanced exception boundary catches in background services.\n- Restructured middleware stack metrics.\n\n\n*// End of AI generated markdown //*`;
      
      pr.teamsPost = `🤖 **Release Concierge Auto-Update**:\n\n**PR #${pr.id}:** ${pr.title}\n**Author:** ${pr.authorName} (${pr.authorHandle})\n**Assessment:** ${pr.risk} Risk Profile detected.\n\nAll build suites compiled successfully! The update is approved for deployment queue pending formal pipeline release.`;

      pr.reasoningTrace = [
        {
          title: "Code Scanning",
          description: "Scanned and evaluated all files changed. 0 critical vulnerabilities resolved.",
          status: "success",
          icon: "FileSearch"
        },
        {
          title: "Dependency Mapping",
          description: `Checked imports. Linked correctly into release namespace.`,
          status: "success",
          icon: "GitBranch"
        },
        {
          title: "Security Heuristics",
          description: "Analyzed authentication vectors. Credentials redacted gracefully.",
          status: "success",
          icon: "ShieldAlert"
        },
        {
          title: "Artifact Generation",
          description: "Drafted markdown changelogs and teams publication streams.",
          status: "success",
          icon: "FileSignature"
        }
      ];

      prs[prIndex] = pr;
      return res.json({ success: true, pr, notice: "AI simulated locally (GEMINI_API_KEY environment variable not configured)." });
    }, 1500);
    return;
  }

  try {
    const prompt = `Analyze this code change and pull request details:
    Title: ${pr.title}
    Type: ${pr.type}
    Branch: ${pr.branch}
    Description: ${pr.description}

    Perform a high quality Devops evaluation and return a raw JSON object strictly adhering to the schema below.
    Do NOT warp inside markdown codeblocks like \`\`\`json. Return only the JSON object.
    
    JSON Schema:
    {
      "risk": "Low" | "Medium" | "High",
      "riskDetail": "one clear sentence detailing the scope of deployment risk",
      "filesChanged": number (suggest a realistic value based on current details),
      "methodsImpacted": number (suggest a realistic value based on current details),
      "changelog": "markdown formatting string outlining Release Notes: include '## Added' and '## Improved' sections",
      "teamsPost": "markdown formatted message celebrating the deployment suitable for a MS Teams post",
      "reasoningTrace": [
        {
          "title": "e.g., Code Scanning",
          "description": "brief analysis description of the parsing step",
          "status": "success" | "warning" | "error" | "info",
          "icon": "FileSearch" | "GitBranch" | "ShieldAlert" | "FileSignature"
        }
      ]
    }
    Make sure to generate exactly 4 logical steps in the reasoning trace representing Code Scanning, Dependency Mapping, Security/Vulnerability audit, and Artifact Generation. Keep step.icon corresponding to standard Lucide keywords of your choice (e.g. FileSearch, GitBranch, ShieldAlert, FileSignature).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const text = response.text || "{}";
    // Clean string from potential JSON markdown wraps
    const cleanJsonString = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleanJsonString);

    pr.risk = result.risk || "Medium";
    pr.riskDetail = result.riskDetail || "Scoped to modules correctly.";
    pr.filesChanged = result.filesChanged || pr.filesChanged || 10;
    pr.methodsImpacted = result.methodsImpacted || pr.methodsImpacted || 30;
    pr.changelog = result.changelog + "\n\n*// End of AI generated markdown //*";
    pr.teamsPost = result.teamsPost;
    pr.reasoningTrace = result.reasoningTrace || pr.reasoningTrace;

    prs[prIndex] = pr;
    res.json({ success: true, pr });
  } catch (error: any) {
    console.error("Gemini compilation error:", error);
    res.status(500).json({ error: error.message || "Gemini Generation failed" });
  }
});

// 5. Approve & complete release
app.post("/api/prs/:id/approve", (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;
  const prIndex = prs.findIndex(p => p.id === id);
  if (prIndex === -1) {
    return res.status(404).json({ error: "PR not found" });
  }

  prs[prIndex].approved = true;
  prs[prIndex].verified = !!verified;
  prs[prIndex].status = "Released";
  res.json({ success: true, pr: prs[prIndex] });
});


// Mounting Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
