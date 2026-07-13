// Local CI compatibility for Node 20.11. Production must use the version in package.json.
const crypto = require("node:crypto");

if (!crypto.hash) {
  crypto.hash = (algorithm, data, outputEncoding) =>
    crypto.createHash(algorithm).update(data).digest(outputEncoding);
}
