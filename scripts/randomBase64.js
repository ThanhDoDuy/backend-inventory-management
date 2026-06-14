// randomBase64.js

const crypto = require("crypto");

function generateBase64Token(size = 32) {
  return crypto.randomBytes(size).toString("base64");
}

// generate & log
const token = generateBase64Token();

console.log("Random Base64 Token:");
console.log(token);