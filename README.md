# Azure Recording Download and Preview Sample
This is a sample code that uses plain JS, HTML and CSS without any framework together with NodeJS as its backend. The sample code entry point is `server.js`. This will be your web server that serve frontend static file inside `/public/` folder and backend under `/api/` routes.

# Folder Structure
```
node_modules
public
  - index.html
  - client.js
.env
.env.example
package.json
server.js
```

- `node_modules` -- The folder will be automatically generated when you run `npm install`
- `public/index.html` -- Your frontend code. It only contains HTML and CSS. If you are looking for JavaScript, it is located in different file
- `public/client.js` -- All your frontend JavaScript code is here. The code is imported from `<script>` tag inside `index.html`
- `.env` and `.env.example` -- Put your environment variable inside `.env`. If you are looking for environment sample, refer to `.env.example`
- `package.json` -- All NodeJS dependecies and mainly used for backend
- `server.js` -- Entry point for the application. The application will serve the static file located inside `/public/` folder. Your backend code will be located here as well.

# How To Run
Before running, you need to have knowledge on NodeJS, and you also need to have NodeJS installed in your machine. If you haven't please install it first.
1. Run `npm install` to install all the dependencies
2. `npm run start` to start the server
3. Go to `http://localhost:8000/` this will be your frontend. If you specify `PORT` in your `.env` file, your port might not be `8000`.

There are 2 actors in this sample (Agent and Customer). You need to have at least 2 browsers or 2 tabs to run this sample

**AGENT**
1. Open `http://localhost:8000/` and enter your room name in the box
2. Click `Connect as Agent`
3. Wait until Customer come to your room
4. Click `Start Recording` to start the recording
5. Click `End Recording` to end the recording
6. Click `Preview Recording` to preview the recorded video
7. Click `Download Recording` to download the recorded video

**CUSTOMER**
1. Open `http://locahost:8000/` and enter your room name. Your room name must be the same as Agent's
2. Click `Connect as Customer`

# Backend Explanation
There are some logic implemented in the backend. The backend routes will start with `/api/*`. All the backend have comments on it. You can take a look and read the comment from the source code directly.

If you are looking a code to generate Download/Preview URL from Azure Storage, you can go to `/api/archives/:archive_id` routes. 

```js
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
    
      const containerClient = blobServiceClient.getContainerClient(
        process.env.AZ_CONTAINER_NAME
      );
      
      const blobClient = containerClient.getBlobClient(
        `${process.env.OT_API_KEY}/${archiveId}/archive.mp4`
      );
      
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
```

The snippet above will first request the status from Opentok. If the status is not `uploaded` the snippet will return `error 500` to the requester. However, when the status is `uploaded`, the snippet will generate 5 minutes url for requester and return it as `json` response.

# Frontend Explanation
This is a bit tricky. Vonage Video API doesn't provide you `url` when you save the recording to other provider. The frontend need to rely on your backend to get the url. 

The logic for this sample is to retry every 10 seconds until it gets the Download/Preview Url.

```js
const retrieveAzureUrl = async (archive) => {
  try {
    const url = `/api/archives/${archive.id}`;
    const response = await fetch(url, { method: "GET" });
    const jsonResponse = await response.json();
    return { url: jsonResponse.url };
  } catch (err) {
    // retry when receive error from backend
    // usually, backend will throw error when the recording is not ready
    // sleep for 10 seconds, and try again
    await new Promise(
      (resolve) => setTimeout(resolve, 10000)
    );
    return retrieveAzureUrl(archive);
  }
}
```

The above snippet is called in Preview and Download Recording button. It will automatically retry every 10 seconds to get the url. 
