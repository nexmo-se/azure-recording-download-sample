const btnAgent = document.getElementById("btn_connect_agent");
const btnCustomer = document.getElementById("btn_connect_customer");
const btnStartRecording = document.getElementById("btn_start_recording");
const btnStopRecording = document.getElementById("btn_stop_recording");
const btnPreviewRecording = document.getElementById("btn_preview_recording");
const btnDownloadRecording = document.getElementById("btn_download_recording");
const btnEndCall = document.getElementById("btn_end_call");
const txtRoomName = document.getElementById("txt_room_name");
const lblRole = document.getElementById("lbl_role");
const previewSection = document.getElementById("preview_section");
const previewContainer = document.getElementById("preview_container");

let myRole = undefined;
let roomName = undefined;
let session = undefined;
let publisher = undefined;
let subscriber = undefined;
let isRecording = false;
let archive = undefined;

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

const subscribeToStream = ({ stream }) => {
  if (session) {
    const container = (myRole === "agent")? "customer-container": "agent-container";
    subscriber = session.subscribe(stream, container, {
      insertMode: "append",
      width: "100%",
      height: "100%"
    });

    if (publisher && subscriber) {
      btnStartRecording.disabled = false;
    }
  }
}

const unsubscribeToStream = ({ stream }) => {
  if (subscriber && session) {
    session.unsubscribe(subscriber);
  }
}

const connectToOpentok = async (container) => {
  btnAgent.disabled = true;
  btnCustomer.disabled = true;

  try {
    myRole = container.split("-")[0];
    lblRole.innerHTML = `I'm ${_.startCase(myRole)}`

    // remove btnStartRecording and btnStopRecording if the role is customer
    if (myRole === "customer") {
      btnStartRecording.style.display = "none";
      btnStopRecording.style.display = "none";
      btnPreviewRecording.style.display = "none";
      btnDownloadRecording.style.display = "none";
      btnEndCall.style.display = "none";
      previewSection.style.display = "none";
    }

    const response = await fetch(`/api/rooms/${roomName}`);
    const {
      api_key: apiKey,
      session_id: sessionId,
      token
    } = await response.json();

    // Make sure the api server returns me `session_id`, `api_key` and `token`
    if (apiKey && sessionId && token) {
      session = OT.initSession(apiKey, sessionId);
      
      // Handle subscribe and unsubscribe event
      session.on("streamCreated", subscribeToStream);
      session.on("streamDestroyed", unsubscribeToStream);
      
      publisher = OT.initPublisher(container, {
        insertMode: "append",
        width: "100%",
        height: "100%"
      });

      session.connect(token, (err) => {
        if (err) throw err;
        else {
          // After connecting without error, next we will publish the publisher
          // to the session
          session.publish(publisher);

          btnEndCall.disabled = false;
        }
      });
    } else throw new Error("Server Error")
  } catch (err) {
    // Error might happen when you are connecting
    // For the sake of simplicity, we don't handle the error
    // However, it is the best practice to handle the error such as AccessDenied
    console.log(err);
    btnAgent.disabled = true;
    btnCustomer.disabled = true;
  }
}

btnAgent.onclick = () => connectToOpentok("agent-container");
btnCustomer.onclick = () => connectToOpentok("customer-container");
btnEndCall.onclick = () => {
  if (session) {
    session.disconnect();
    window.location.reload();
  }
}

btnStartRecording.onclick = async () => {
  btnStartRecording.disabled = true;
  if (roomName && session) {
    try {
      const url = `/api/rooms/${roomName}/archives`;
      const response = await fetch(url, { method: "POST" });
      const jsonResponse = await response.json();

      // Just for the sake of object creation
      // Because the response is in snake_case
      // But JavaScript convention is camelCase. 
      // You can ignore this if it doesn't meet your style
      archive = { id: jsonResponse.id };

      isRecording = true;
      btnStopRecording.disabled = false;
    } catch (err) {
      btnStartRecording.disabled = false;
    }
  } else {
    btnStartRecording.disabled = false;
  }
}

btnStopRecording.onclick = async () => {
  btnStopRecording.disabled = true;
  if (isRecording && archive) {
    try {
      const url = `/api/archives/${archive.id}`;
      await fetch(url, { method: "DELETE" });
      isRecording = false;
      btnStopRecording.disabled = true;
      btnStartRecording.disabled = true;

      btnPreviewRecording.disabled = false;
      btnDownloadRecording.disabled = false;
    } catch (err) {
      btnStopRecording.disabled = false;
    }
  } else {
    btnStopRecording.disabled = false;
  }
}

btnPreviewRecording.onclick = async () => {
  btnPreviewRecording.disabled = true;
  previewContainer.innerHTML = "<p>Generating...</p>"

  if (archive && !isRecording) {
    const { url: previewUrl } = await retrieveAzureUrl(archive);
    if (previewUrl) {
      previewContainer.innerHTML = `
        <video src=${previewUrl} autoPlay />
      `;
    }
    btnPreviewRecording.disabled = false;
  } else {
    btnPreviewRecording.disabled = false;
    previewContainer.innerHTML = "";
  }
}

btnDownloadRecording.onclick = async () => {
  btnDownloadRecording.disabled = true;
  previewContainer.innerHTML = "<p>Generating...</p>"

  if (archive && !isRecording) {
    const { url: downloadUrl } = await retrieveAzureUrl(archive);
    if (downloadUrl) {
      previewContainer.innerHTML = `
        <p>
          Your download URL. Download will start automatically.
          <a href="${downloadUrl}" target="_blank">
            ${downloadUrl}
          </a>
        </p>
      `
      // Programmatically download action
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.click();
      a.remove();
    }
    btnDownloadRecording.disabled = false;
  } else {
    btnDownloadRecording.disabled = false;
    previewContainer.innerHTML = "";
  }
}

/**
 * Make sure btnAgent and btnCustomer is clickable when `roomName` is available.
 * @param {InputEvent<HTMLInputElement>} e 
 */
txtRoomName.oninput = (e) => {
  roomName = e.target.value;

  btnAgent.disabled = (!roomName);
  btnCustomer.disabled = (!roomName);
}
