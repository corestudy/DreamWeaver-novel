const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist-electron");

try {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log(`removed: ${distDir}`);
  }
} catch (error) {
  console.error(`failed to remove ${distDir}: ${error.message}`);
  process.exitCode = 1;
}
