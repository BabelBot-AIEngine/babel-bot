// Import the built Express app
const app = require('../dist/index.js').default;

// Export for Vercel
module.exports = app;