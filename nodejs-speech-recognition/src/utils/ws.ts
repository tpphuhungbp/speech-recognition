import { WebSocket, WebSocketServer } from "ws";
import { OpenAI } from "openai";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { createReadStream, createWriteStream, unlink } from "fs";
import { createRequire } from "module";

const openai = new OpenAI();

let audioChunks: Buffer[] = [];

//interface này đại diện cho duy nhất một Websocket
declare interface Socket extends WebSocket {
  isAlive: boolean;
}

//interface chỉ một channel hay gọi là một room
//channel: tên room -> dùng để kết nối vào room
// ws: danh sách các websocket/ các kết nối của các máy đang kết nói tới room
interface ISocketStore {
  channel: string;
  audioChunks: Buffer[];
  ws: Socket[];
}

// object wss đại diện cho Websocket server chính,
// noServer=true -> không tự động listen từ tất cả kết nối bên ngoài.
// chỉ tạo khi có người gửi request tới
const wss = new WebSocketServer({ noServer: true });

// biến chứa TOÀN BỘ room
const listWS: ISocketStore[] = [];

async function transcribeBatch(audioBuffer: Buffer) {
  const audioFileName = `${uuidv4()}.webm`;
  const audioFilePath = path.join(__dirname, audioFileName);

  // Write the audio buffer to a file
  createWriteStream(audioFilePath).write(audioBuffer);

  try {
    console.log("audio path", audioFilePath);
    const transcript = await openai.audio.transcriptions.create({
      file: createReadStream(audioFileName),
      model: "whisper-1", // Use Whisper model
      // language: "en", // Set the language if necessary
    });

    console.log("Partial Transcription:", transcript.text);
    return transcript.text;
  } catch (error) {
    console.error("Transcription Error:", error);
  } finally {
    // Clean up the temporary file
    unlink(audioFilePath, (err) => {
      if (err) console.error("Error deleting file:", err);
    });
  }
}

//Định nghĩa khi bắt được event "connection" vào websocket server
wss.on("connection", async (ws: Socket, req) => {
  //http request gửi tới, ta sẽ tách để lấy channel
  const channel = req.url?.split("/").pop();

  //nếu không có channel -> báo error code -> đóng connection
  if (!channel) {
    ws.send("Channel không hợp lệ");
    ws.close();
    return;
  }

  //nếu có channel:
  //tìm xem channel đã tồn tại hay chưa
  const wsIndex = listWS.findIndex((item) => item.channel === channel);

  if (wsIndex !== -1) {
    //nếu có, ta thêm connection này vào trong room.
    listWS[wsIndex].ws.push(ws);
    ws.send("Cảnh bảo: Server đang có người dùng!");
    console.log(
      `User vừa đăng nhập vào channel tên \"${channel}\", hiện tại channel có ${listWS[wsIndex].ws.length} người`
    );
    listWS[wsIndex].audioChunks = [];
  } else {
    //nếu không, ta tạo một room/channel, thêm connection này vào
    listWS.push({ channel, ws: [ws], audioChunks: [] });
    console.log(`Tạo channel mới. User vừa đăng nhập vào channel tên \"${channel}\"`);
  }

  //gắn trạng thái connection này đang hoạt động
  ws.isAlive = true;

  //nếu connection hiện tại nhận được phản hồi-> đặt nó Alive
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", async (chunk: Buffer) => {
    // console.log("Received:", chunk);
    audioChunks.push(chunk);
    if (audioChunks.length >= 2) {
      const combinedAudio = Buffer.concat(audioChunks);
      audioChunks = []; // Clear the buffer after sending
      const transcript = await transcribeBatch(combinedAudio);
      console.log("----transcript end---");
      // Send the partial transcript back to the client
      ws.send(JSON.stringify({ text: transcript }));
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

function noop() {}
//Đặt timeout = 30s -> quá thời gian thì xóa connection
setInterval(() => {
  listWS.forEach((item) => {
    const activeClients: Socket[] = [];
    item.ws.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
      } else {
        ws.isAlive = false;
        ws.ping(noop);
        activeClients.push(ws);
      }
    });
    if (item.ws.length > activeClients.length) {
      console.log(
        `Xóa ${item.ws.length - activeClients.length} người dùng trong channel ${
          item.channel
        }, còn lại ${activeClients.length} clients`
      );
      if (activeClients.length == 0) {
        item.audioChunks = [];
      }
    }

    item.ws = activeClients;
  });
}, 30000);

export default wss;
