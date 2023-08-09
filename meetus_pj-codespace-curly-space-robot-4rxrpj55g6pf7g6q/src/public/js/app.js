const socket = io();

const myScreen = document.getElementById("myScreen");
const myVideo = document.getElementById("myVideo");
const cameraSelect = document.getElementById("cameraSelect");
const videoBtn = document.getElementById("video");
const audioBtn = document.getElementById("audio");
const screenBtn = document.getElementById("screen");
const messages = document.getElementById("messages");
const chatForm = document.getElementById("chat");
const waitRoom = document.getElementById("waitRoom");
const waitRoomForm = waitRoom.querySelector("form");
const callRoom = document.getElementById("callRoom");

// callRoom.hidden = true;
callRoom.style.display = "none";

let videoStream;
let screenStream = null;
let muted = false;
let screenoff = false;
let cameraOff = false;
let roomName;
let nickname;
let myPeerConnection;
let myDataChannel;


async function getVideo() {

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    myVideo.srcObject = videoStream;

    myPeerConnection.addTrack(videoStream.getVideoTracks()[0], videoStream);
    const offer = await myPeerConnection.createOffer();
    await myPeerConnection.setLocalDescription(offer);

    socket.emit("send_offer", offer, roomName)
    await getCamera();
  } catch (e) {
    console.log(e);
  }
}

async function getCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");

    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      cameraSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

function handleAudioClick() {
  videoStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (!muted) {
    audioBtn.innerText = "Unmute";
  } else {
    audioBtn.innerText = "Mute";
  }
  muted = !muted;
}

async function handleCameraClick() {
  if (!videoStream) {
    await getVideo();
    return;
  }

  if (!cameraOff) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoBtn.innerText = "Turn Camera off";
    handleCameraChange();
  } else {
    await getVideo();
    videoBtn.innerText = "Turn Camera on";
    handleCameraChange();
  }
  cameraOff = !cameraOff;
}

async function handleCameraChange() {
  if (!myPeerConnection) return;

  if (myPeerConnection) {
    
    const blackVideoTrack = screenStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(blackVideoTrack);
  }
}

async function getScreen() {

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    });

    myScreen.srcObject = screenStream;

    myPeerConnection.addTrack(screenStream.getVideoTracks()[0], screenStream);

    const offer = await myPeerConnection.createOffer();
    await myPeerConnection.setLocalDescription(offer);
    socket.emit("send_offer", offer, roomName)
  } catch (e) {
    console.log(e);
  }
}



async function handleScreenClick() {
  if (!screenStream) {
    screenBtn.innerText = "Turn screen off";
    await getScreen();
    // myPeerConnection = null; // 기존 커넥션 종료
    // makeConnection(); // 새로운 커넥션 설정
    return;
  }

  if (!screenoff) {
    screenStream.getTracks().forEach((track) => track.stop());
    
    // Create a new black video track
    screenBtn.innerText = "Turn screen on";
    handleScreenChange(); // 화면 공유가 중지될 때 화면 변경을 상대방에게 전달
  }
  else if (screenoff) {
    await getScreen(); // 화면 공유를 시작
    screenBtn.innerText = "Turn screen off";
    handleScreenChange(); // 화면 공유가 시작될 때 화면 변경을 상대방에게 전달
  }
  screenoff = !screenoff;
}


async function handleScreenChange() {
  if (!myPeerConnection) return; // myPeerConnection이 존재하지 않는 경우 종료
  if (myPeerConnection) {
    const blackVideoTrack = screenStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(blackVideoTrack);
  }

}


screenBtn.addEventListener("click", handleScreenClick);
videoBtn.addEventListener("click", handleCameraClick);
cameraSelect.addEventListener("change", handleCameraChange);

// --------------- wait room form (choose and enter a room) -----------------

function createBlackVideoTrack() {
  const canvas = document.createElement("video");
  canvas.width = 640; // Set the desired width
  canvas.height = 480; // Set the desired height

  const context = canvas.getContext("2d");
  context.fillStyle = "yellow";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream();
  const blackVideoTrack = stream.getVideoTracks()[0];
  return blackVideoTrack;
}


function showRoom() {
  waitRoom.style.display = "none";

  callRoom.hidden = false;
  callRoom.style.display = "flex";
}

async function handleRoomSubmit(e) {
  e.preventDefault();

  // 카메라, 마이크 장치 연결 설정
  await initCall();
  // 닉네임 설정
  const nicknameInput = waitRoom.querySelector("#nickname");
  socket.emit("set_nickname", nicknameInput.value);

  // 채팅방 입장
  const roomNameInput = waitRoom.querySelector("#roomName");
  socket.emit("enter_room", roomNameInput.value, showRoom);

  roomName = roomNameInput.value;
  nickname = nicknameInput.value;
}

async function initCall() {
  // waitRoom.style.display = "none";
  // // waitRoom.hidden = true;
  // callRoom.hidden = false;
  // callRoom.style.display = "flex";
  makeConnection();
}


waitRoomForm.addEventListener("submit", handleRoomSubmit);

// --------- Socket Code ----------

socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", addMessage);

  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("send_offer", offer, roomName);
});

socket.on("receive_offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (e) => {
    myDataChannel = e.channel;
    myDataChannel.addEventListener("message", addMessage);
  });
  myPeerConnection.setRemoteDescription(offer);

  // getMedia
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("send_answer", answer, roomName);
});

socket.on("receive_answer", (answer) => {
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("receive_ice", (ice) => {
  myPeerConnection.addIceCandidate(ice);
});

// --------- RTC Code ---------

function handleIce(data) {
  socket.emit("send_ice", data.candidate, roomName);
}



function handleAddTrack(event) {

  console.log(event);
  peerStream = new MediaStream([event.track]);
  peerScreen.srcObject = peerStream;

  peerStream = new MediaStream([event.track]);
  peerVideo.srcObject = peerStream;
}




function makeConnection() {

  myPeerConnection = new RTCPeerConnection();
  myPeerConnection.addEventListener("icecandidate", handleIce);

  myPeerConnection.addEventListener("track", handleAddTrack);


}

// --------- Data Channel Code ---------

function addMessage(e) {
  const li = document.createElement("li");
  li.innerHTML = e.data;
  messages.append(li);
}

function addMyMessage(e) {
  const li = document.createElement("li");
  li.innerHTML = e.data;
  li.style.color = "black";
  li.style.background = "#FEE715";
  messages.append(li);
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = chatForm.querySelector("input");
  if (myDataChannel != null) {
    myDataChannel.send(`${nickname}: ${input.value}`);
  }
  addMyMessage({ data: `You: ${input.value}` });
  input.value = "";
}

chatForm.addEventListener("submit", handleChatSubmit);
