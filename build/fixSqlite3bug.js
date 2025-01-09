const fs = require("fs");
const path = require("path");

// edit sqlite3 package.json
const sqlite3Path = path.join(
  process.cwd(),
  "node_modules",
  "sqlite3",
  "package.json",
);
const sqlite3 = require(sqlite3Path);
sqlite3.binary = {
  napi_versions: [6],
};
fs.writeFileSync(sqlite3Path, JSON.stringify(sqlite3, null, 2));
