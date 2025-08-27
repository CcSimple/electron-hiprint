const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

let commitId = "unknown";
let commitDate = "unknown";
try {
  commitId = execSync("git rev-parse HEAD").toString().trim();
} catch (e) {
  // fallback value already set
}
try {
  commitDate = execSync("git log -1 --format=%cd --date=iso").toString().trim();
} catch (e) {
  // fallback value already set
}

const info = { commitId, commitDate };
fs.writeFileSync(path.join(__dirname, "../build-info.json"), JSON.stringify(info, null, 2));
