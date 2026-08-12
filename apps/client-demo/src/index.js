const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.CLIENT_PORT || 5000;

// Serve static HTML/CSS/JS web frontend
app.use(express.static(path.join(__dirname, "../public")));

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` [apps/client-demo] Web UI running at http://localhost:${PORT}`);
  console.log(` Open multiple browser tabs to test live chat & CDC!`);
  console.log(`=======================================================`);
});
