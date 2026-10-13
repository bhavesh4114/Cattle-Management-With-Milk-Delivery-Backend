const app = require("../server");

module.exports = (req, res) => {
  // Vercel CLI 62+ rewrites req.url to the destination path (/api/index).
  // Restore the real requested URL from x-matched-path or x-forwarded-uri.
  const originalPath = req.headers["x-matched-path"] || req.headers["x-forwarded-uri"];
  if (originalPath && (req.url === "/api/index" || req.url === "/api/index.js")) {
    req.url = originalPath;
  }
  return app(req, res);
};
