require('dotenv').config()

const express = require("express");
const morgan = require("morgan");
const path = require("path");
const Opentok = require("opentok");
const { DateTime } = require("luxon");
const { MaskMan, snake_case } = require("maskman.js");
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");

const app = express();
const OT = new Opentok(process.env.OT_API_KEY, process.env.OT_API_SECRET);
const sessions = [];

app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "public")));

/**
 * Serving static file, which is index.html inside public folder.
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
});

/**
 * Retrieve session and generate a new token based on `room_name`. 
 * For the sake of simplicity, the session id will be stored in memory.
 */
app.get("/api/rooms/:room_name", (req, res) => {
  const { room_name: roomName } = req.params;

  const foundSession = sessions.find(
    (session) => {
      if (session.roomName === roomName) return true;
      else return false;
    }
  );

  if (!foundSession) {
    // the `room_name` is not avaiable in the database.
    // create new session id.
    OT.createSession({ mediaMode: "routed" }, (err, session) => {
      // If there is error, return error 500 directly to frontend
      // TODO: You need to handle the error properly here
      if (err) return res.status(500).end();

      // Save the sessionId in the database
      sessions.push({
        sessionId: session.sessionId,
        roomName
      });

      // Generate Opentok Token for client authentication purpose
      const token = OT.generateToken(session.sessionId);
      return res.json({
        api_key: process.env.OT_API_KEY,
        session_id: session.sessionId,
        token
      }).end();
    });
  } else {
    // `room_name` is available in the database.
    // Generate Opentok Token for client authentication purpose
    const token = OT.generateToken(foundSession.sessionId);

    return res.json({
      api_key: process.env.OT_API_KEY,
      session_id: foundSession.sessionId,
      token
    }).end();
  }
});

app.post("/api/rooms/:room_name/archives", (req, res) => {
  const { room_name: roomName } = req.params;
  
  const foundSession = sessions.find(
    (session) => {
      if (session.roomName === roomName) return true;
      else return false;
    }
  );

  if (foundSession) {
    // session found in the database
    // start the archive now
    OT.startArchive(foundSession.sessionId, {}, (err, archive) => {
      if (err) return res.status(500).end();
      else {
        // Just for the sake of returning snake_case
        // This is my practice when returning api response
        const payload = MaskMan.convert(archive).to(snake_case);
        return res.json(payload).end();
      }
    });
  } else {
    // Could not start the archive beause no session found in the database
    res.status(500);
  }
});

app.delete("/api/archives/:archive_id", (req, res) => {
  const { archive_id: archiveId } = req.params;
  OT.stopArchive(archiveId, (err, archive) => {
    if (err) return res.status(500).end();
    else {
      // Just for the sake of returning snake_case
      // This is my practice when returning api response
      const payload = MaskMan.convert(archive).to(snake_case);
      return res.json(payload).end();
    }
  })
})

app.get("/api/archives/:archive_id", async (req, res) => {
  const { archive_id: archiveId } = req.params;

  // Check in Opentok server for the archive status
  OT.getArchive(archiveId, async (err, archive) => {
    if (err) return res.status(500).end();

    if (archive.status === "uploaded") {
      // The archive is ready
      // Generate Download or Preview URL from Azure with expirity of 5 minutes
      const sharedKeyCredential = new StorageSharedKeyCredential(
        process.env.AZ_ACCOUNT_NAME,
        process.env.AZ_ACCOUNT_KEY
      );
      const blobServiceClient = new BlobServiceClient(
        `https://${process.env.AZ_ACCOUNT_NAME}.blob.core.windows.net`,
        sharedKeyCredential
      );
    
      const containerClient = blobServiceClient.getContainerClient(process.env.AZ_CONTAINER_NAME);
      const blobClient = containerClient.getBlobClient(`${process.env.OT_API_KEY}/${archiveId}/archive.mp4`);
      const url = await blobClient.generateSasUrl({
        permissions: "read",
        expiresOn: DateTime.local().plus({ minutes: 5 }).toJSDate()
      });
    
      return res.json({
        id: archiveId,
        url
      }).end();
    } else {
      // When the archive is not yet uploaded, throw 500 error
      // The error code can be customise depending on your requirement
      // For the sake of simplictiy, this will use 500 as status code;
      return res.status(500).end(); 
    }
  })
})

app.listen(process.env.PORT || 8000, () => {
  console.log("Express has started")
});