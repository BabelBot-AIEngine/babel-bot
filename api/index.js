// Import the built Express app
try {
  const appModule = require("../dist/index.js");
  const app = appModule.default || appModule;

  // Export for Vercel
  module.exports = app;
} catch (error) {
  console.error("Failed to import app:", error);
  console.error("Current working directory:", process.cwd());
  console.error("Available files:", require("fs").readdirSync("."));

  // Fallback response
  module.exports = (req, res) => {
    res.status(500).json({
      error: "Server configuration error",
      details: error.message,
      cwd: process.cwd(),
    });
  };
}
