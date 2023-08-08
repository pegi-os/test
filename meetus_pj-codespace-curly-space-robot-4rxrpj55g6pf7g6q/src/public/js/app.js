const socket = io();

const myVideo = document.getElementById("myVideo");
const audioBtn = document.getElementById("audio");
const cameraBtn = document.getElementById("camera");
const cameraSelect = document.getElementById("cameraSelect");
const messages = document.getElementById("messages");
const chatForm = document.getElementById("chat");

const waitRoom = document.getElementById("waitRoom");
const waitRoomForm = waitRoom.querySelector("form");

const callRoom = document.getElementById("callRoom");

// callRoom.hidden = true;
callRoom.style.display = "none";

let myStream = null;
let muted = false;
let cameraOff = false;
let roomName;
let nickname;
let myPeerConnection;
let myDataChannel;

async function getMedia() {
  try {
    myStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    });

    myVideo.srcObject = myStream;
    myPeerConnection.addTrack(myStream.getVideoTracks()[0], myStream);

    const offer = await myPeerConnection.createOffer();
    await myPeerConnection.setLocalDescription(offer);
    // Offer를 상대방에게 전송
    socket.emit("send_offer", offer, roomName)
  } catch (e) {
    console.log(e);
  }
}



async function handleCameraClick() {
  if (!myStream) {
    await getMedia();
    // myPeerConnection = null; // 기존 커넥션 종료
    // makeConnection(); // 새로운 커넥션 설정

    return;
  }
  if (!cameraOff) {
    myStream.getTracks().forEach((track) => track.stop());
    cameraOff = true;
    handleCameraChange(); // 화면 공유가 중지될 때 화면 변경을 상대방에게 전달
  } else {
    await getMedia(); // 화면 공유를 시작
    cameraOff = false;
    handleCameraChange(); // 화면 공유가 시작될 때 화면 변경을 상대방에게 전달
  }
}


async function handleCameraChange() {
  if (!myPeerConnection) return; // myPeerConnection이 존재하지 않는 경우 종료

  if (myPeerConnection) {
    const newVideoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(newVideoTrack);
  }
}


cameraBtn.addEventListener("click", handleCameraClick);


// --------------- wait room form (choose and enter a room) -----------------

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

function handleAddStream(data) {
  const peerVideo = document.getElementById("peerVideo");
  peerVideo.srcObject = data.stream;
}


function handleAddTrack(event) {
  if (event.track.kind === "video") {
    peerStream = new MediaStream([event.track]);
    peerVideo.srcObject = peerStream;
  }
}




function makeConnection() {
  myPeerConnection = new RTCPeerConnection();
  myPeerConnection.addEventListener("icecandidate", handleIce);

  myPeerConnection.addEventListener("addstream", handleAddStream);
  if (myStream)
    myStream
      .getTracks()
      .forEach((track) => myPeerConnection.addTrack(track, myStream));

}

// --------- Data Channel Code ---------

function addMessage(e) {
  const li = document.createElement("li");
  li.innerHTML = e.data;
  messages.append(li);
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = chatForm.querySelector("input");
  if (myDataChannel != null) {
    myDataChannel.send(`${nickname}: ${input.value}`);
  }
  addMessage({ data: `You: ${input.value}` });
  input.value = "";
}

chatForm.addEventListener("submit", handleChatSubmit);
