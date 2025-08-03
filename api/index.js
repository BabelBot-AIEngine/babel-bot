// Vercel serverless function handler
module.exports = async (req, res) => {
  try {
    // Import the built Express app dynamically
    const appModule = require("../dist/index.js");
    const app = appModule.default || appModule;

    // Handle the request with the Express app
    return app(req, res);
  } catch (error) {
    console.error("Failed to import or execute app:", error);
    console.error("Current working directory:", process.cwd());

    try {
      const fs = require("fs");
      console.error("Available files in current dir:", fs.readdirSync("."));
      console.error(
        "Available files in dist:",
        fs.readdirSync("./dist").slice(0, 10)
      );
    } catch (e) {
      console.error("Could not list files:", e.message);
    }

    // Return error response
    return res.status(500).json({
      error: "Server configuration error",
      details: error.message,
      cwd: process.cwd(),
      timestamp: new Date().toISOString(),
    });
  }
};
